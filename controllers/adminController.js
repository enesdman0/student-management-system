const asyncHandler = require("express-async-handler");
const Student = require("../models/Student");
const Class = require("../models/Class");
const Leave = require("../models/Leave");
const Teacher = require("../models/Teacher");
const Lesson = require("../models/Lesson");
const Group = require("../models/Group");
const Truancy = require("../models/Truancy");
const Parent = require("../models/Parent");
const PracticeExamTYT = require("../models/PracticeExamTYT");
const PracticeExamAYT = require("../models/PracticeExamAYT");
const Field = require("../models/Field");
const Branch = require("../models/Branch");
const User = require("../models/User");
const isAdmin = require("../middlewares/isAdmin");
const Attendance = require("../models/Attendance");
const Level = require("../models/Level");
const { Op } = require("sequelize");
const Role = require("../models/Role");
const client = require('twilio')(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);

module.exports.index = asyncHandler(async (req, res, next) => {
  const studentCount = await Student.count();
  const teacherCount = await Teacher.count();
  const lessonCount = await Lesson.count();
  const groupCount = await Group.count();
  const classCount = await Class.count();

  res.render("site/index", {
    title: "Anasayfa",
    studentCount: studentCount,
    teacherCount: teacherCount,
    lessonCount: lessonCount,
    groupCount: groupCount,
    classCount: classCount,
  });
});

module.exports.students = asyncHandler(async (req, res, next) => {
  const size = parseInt(process.env.PAGINATION_SIZE);
  const { page = 0, filter } = req.query;
  const name = req.query.search
  let whereClause = {};

  if (name && name.length > 2) {
    whereClause = {
      fullName: {
        [Op.like]: `%${name}%`
      }
    };
  }
  const { rows, count } = await Student.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Group,
        attributes: ["name"],
      },
    ],
    limit: size,
    offset: page * size,
  });
  res.render("admin/students", {
    title: "Öğrenciler",
    students: rows,
    totalItems: count,
    totalPages: Math.ceil(count / size),
    currentPage: page,
    filter: filter,
  });
});

module.exports.student = asyncHandler(async (req, res, next) => {
  const alert = req.session.alert;
  delete req.session.alert;

  const id = req.params.id;
  const student = await Student.findByPk(id, {
    include: [
      {
        model: Group,
        include: [Teacher],
      },
      {
        model: Truancy,
      },
      "parent",
    ],
  });
  return res.render("admin/student-profile", {
    title: `${student.fullName} - Öğrenci profili`,
    student: student,
    alert: alert,
  });
});

module.exports.studentPractices = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  const size = parseInt(process.env.PAGINATION_SIZE);
  const { page = 0, filter = "default" } = req.query;

  let { rows: rows1, count: count1 } = await PracticeExamTYT.findAndCountAll({
    where: { studentId: id },
    order: [["totalNet", "DESC"]],
    raw: true,
    limit: size,
    offset: page * size,
  });

  let { rows: rows2, count: count2 } = await PracticeExamAYT.findAndCountAll({
    where: { studentId: id },
    order: [["totalNet", "DESC"]],
    raw: true,
    limit: size,
    offset: page * size,
  });

  let totalItems = count1 + count2;

  let practices = [...rows1, ...rows2];
  let totalPages = Math.ceil(totalItems / size);
  practices.sort((a, b) => {
    a.practiceDate - b.preacticeDate;
  });
  if (filter === "tytHigh") {
    practices = rows1;
    totalPages = Math.ceil(count1 / size);
    totalItems = count1;
  } else if (filter === "aytHigh") {
    practices = rows2;
    totalPages = Math.ceil(count2 / size);
    totalItems = count2;
  }

  res.render("admin/student-practices", {
    title: `Öğrencinin Deneme sınavları`,
    practices: practices,
    filter: filter,
    limit: size,
    offset: page * size,
    totalItems: totalItems,
    totalPages: totalPages,
    currentPage: page,
  });
});

module.exports.studentSettingsGet = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  const student = await Student.findByPk(id, {
    include: [
      {
        model: Group,
        attributes: ["name", "id"],
      },
    ]
  });
  const groups = await Group.findAll();
  res.render("admin/student-settings", {
    title: `${student.fullName} - Öğrenci ayarları`,
    student: student,
    groups: groups,
    csrfToken: req.csrfToken(),
  });
});

module.exports.studentSettingsPost = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  const { fullName = null, telephoneNumber = null, groupId } = req.body;

  const student = await Student.update(
    {
      fullName: fullName.toUpperCase(),
      telephoneNumber: telephoneNumber,
      groupId: groupId,
    },
    { where: { id: id } }
  );

  let alert = {
    message: "Öğrenci bilgileri başarıyla güncellendi",
    type: "success",
  };
  req.session.alert = alert;
  res.redirect(`/student/${id}`);
});

module.exports.attendancesConfirmGet = asyncHandler(async (req, res, next) => {
  const alert = req.session.alert
  delete req.session.alert
  const attendances = await Attendance.findAll({
    where: {
      confirm: false
    },
    include: {
      model: Student,
      attributes: ["id", "fullName"],
      include: [
        {
          model: Parent,
          attributes: ["fullName", "telephoneNumber"]
        },
        {
          model: Group,
          attributes: ["name"]
        }
      ]
    },
    raw: true
  });
  let obj = {};
  attendances.forEach(student => {
    const studentId = student["students.id"];
    const fullName = student["students.fullName"];
    const groupName = student["students.group.name"];
    const lessonNumber = student.lesson;
    const parent = student["parent.fullName"];
    if (studentId !== null) {
      if (!obj.hasOwnProperty(studentId)) {
        obj[studentId] = {
          fullName: fullName,
          groupName: groupName,
          lessons: {},
          parentInfo: {}
        };
      }
      obj[studentId].lessons[lessonNumber] = true;
      obj[studentId].parentInfo.fullName = student["students.parent.fullName"]
      obj[studentId].parentInfo.telephoneNumber = student["students.parent.telephoneNumber"]
    }
  });
  res.render("admin/attendances-confirm", {
    title: "Devamsızlıkları onayla",
    csrfToken: req.csrfToken(),
    students: obj,
    alert: alert
  });
});
module.exports.attendancesConfirmPost = asyncHandler(async (req, res, next) => {
  const list = []
  for (let key in req.body) {
    if (key !== "_csrf") {
      const desc = req.body[key];
      const student = await Student.findByPk(key, {
        attributes: ["fullName"],
        include: {
          model: Parent,
          attributes: ["telephoneNumber"]
        }
      });
      await Truancy.create({
        description: desc,
        studentId: key
      })
      list.push(`Sayın veli, öğrenciniz; ${student.fullName} ${desc} devamsızlık yapmıştır`)
      await client.messages
        .create({
          body: `Sayın veli, öğrenciniz; ${student.fullName} ${desc} devamsızlık yapmıştır`,
          from: process.env.TWILIO_NUMBER,
          to: `+90${student.parent.telephoneNumber}`
        })
        .then(message => console.log(message.sid))
        .catch();
    }
  }
  await Attendance.destroy({
    where: {
      date: Date.now(),
    }
  })
  let alert = {
    message: "Öğrenci bilgileri başarıyla güncellendi",
    type: "success",
  };
  req.session.alert = alert;
  res.redirect("/attendances/confirm");
});

module.exports.studentTruancies = asyncHandler(async (req, res, next) => {
  const id = req.params.id
  const alert = req.session.alert
  delete req.session.alert;
  const size = parseInt(process.env.PAGINATION_SIZE);
  const { page = 0 } = req.query;
  const { rows, count } = await Truancy.findAndCountAll({
    where: {
      studentId: id
    },
    raw: true,
    limit: size,
    offset: page * size
  })
  res.render("admin/student-truancies", {
    title: "Devamsızlıkları görüntüle",
    truancies: rows,
    totalItems: count,
    totalPages: Math.ceil(count / size),
    currentPage: page,
    alert: alert
  })
})

module.exports.studentTruancieDelete = asyncHandler(async (req, res, next) => {
  const id = req.params.id
  const truancy = await Truancy.findByPk(id)
  truancy.destroy()
  req.session.alert = {
    message: "Devamsızlık bilgisi başarıyla silindi",
    type: "success",
  }
  res.redirect(`/student/${id}/truancies`)
})

module.exports.teacherLeaves = asyncHandler(async (req, res, next) => {
  const id = req.params.id
  const alert = req.session.alert
  delete req.session.alert;
  const size = parseInt(process.env.PAGINATION_SIZE);
  const { page = 0 } = req.query;
  const { rows, count } = await Leave.findAndCountAll({
    where: {
      teacherId: id
    },
    raw: true,
    limit: size,
    offset: page * size
  })
  res.render("admin/teacher-leaves", {
    title: "İzinleri görüntüle",
    leaves: rows,
    totalItems: count,
    totalPages: Math.ceil(count / size),
    currentPage: page,
    alert: alert
  })
})

module.exports.teacherLeaveDelete = asyncHandler(async (req, res, next) => {
  const id = req.params.id
  const leave = await Leave.findByPk(id)
  leave.destroy()
  req.session.alert = {
    message: "İzin bilgisi başarıyla silindi",
    type: "success",
  }
  res.redirect(`/teacher/${id}/leaves`)
})

module.exports.parentSettingsGet = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  const parent = await Parent.findByPk(id);

  res.render("admin/parent-settings", {
    title: `${parent.fullName} - Veli ayarları`,
    parent: parent,
    csrfToken: req.csrfToken()
  });
});

module.exports.parentSettingsPost = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  const { fullName = null, telephoneNumber = null, groupId } = req.body;

  const parent = await Parent.update(
    { fullName: fullName.toUpperCase(), telephoneNumber: telephoneNumber },
    { where: { id: id } }
  );

  let alert = {
    message: "Veli bilgileri başarıyla güncellendi",
    type: "success",
  };
  req.session.alert = alert;
  res.redirect(`/student/${id}`);
});

module.exports.teachers = asyncHandler(async (req, res, next) => {
  const size = parseInt(process.env.PAGINATION_SIZE);
  const { page = 0, filter } = req.query;
  const name = req.query.search
  let whereClause = {};

  if (name && name.length > 2) {
    whereClause = {
      fullName: {
        [Op.like]: `%${name}%`
      }
    };
  }
  const { rows, count } = await Teacher.findAndCountAll({
    where: whereClause,
    limit: size,
    offset: page * size,
    include: [{
      model: Branch,
      attributes: ["name"]
    }]
  });
  res.render("admin/teachers", {
    title: "Öğretmenler",
    teachers: rows,
    totalItems: count,
    totalPages: Math.ceil(count / size),
    currentPage: page,
    filter: filter,
  });
});

module.exports.teacher = asyncHandler(async (req, res, next) => {
  const alert = req.session.alert;
  delete req.session.alert;

  const id = req.params.id;
  const size = parseInt(process.env.PAGINATION_SIZE);
  const { page = 0, filter } = req.query;

  const teacher = await Teacher.findOne({
    where: {
      id: id
    },
    include: [{
      model: Branch,
      attributes: ["name"]
    },
    {
      model: Leave
    }],
  });

  res.render("admin/teacher-profile", {
    title: `${teacher.fullName}`,
    teacher: teacher,
    alert: alert
  });
});

module.exports.teacherSettingsGet = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  const teacher = await Teacher.findByPk(id, {
    include: [{
      model: Branch,
    }]
  });
  const branches = await Branch.findAll();
  res.render("admin/teacher-settings", {
    title: `${teacher.fullName} - Öğretmen ayarları`,
    teacher: teacher,
    branches: branches,
    csrfToken: req.csrfToken(),
  });
});

module.exports.teacherSettingsPost = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  const { fullName = null, telephoneNumber = null, branchId } = req.body;

  await Teacher.update(
    {
      fullName: fullName.toUpperCase(),
      telephoneNumber: telephoneNumber,
      branchId: branchId,
    },
    { where: { id: id } }
  );

  let alert = {
    message: "Öğretmen bilgileri başarıyla güncellendi",
    type: "success",
  };
  req.session.alert = alert;
  res.redirect(`/teacher/${id}`);
});

module.exports.groups = asyncHandler(async (req, res, next) => {
  const groups = await Group.findAll()
  res.render("admin/groups", {
    title: "Gruplar",
    groups: groups
  })
});

module.exports.group = asyncHandler(async (req, res, next) => {
  const group = await Group.findByPk(req.params.id, {
    include: [
      {
        model: Student,
        attributes: ["fullName", "id"]
      },
      {
        model: Teacher,
        attributes: ["fullName", "id"]
      },
      {
        model: Class,
        attributes: ["name"]
      },
      {
        model: Level,
        attributes: ["name"]
      },
      {
        model: Field,
        attributes: ["name"]
      },
    ]
  })
  res.render("admin/group", {
    title: `Grup ${group.name}`,
    group: group
  })
});

module.exports.add = asyncHandler(async (req, res, next) => {
  res.render("site/add", {
    title: "Kayıt ekle"
  })
});
module.exports.addStudentGet = asyncHandler(async (req, res, next) => {
  const alert = req.session.alert;
  const errors = req.session.errors;
  delete req.session.alert;
  delete req.session.errors;
  const groups = await Group.findAll()
  const parents = await Parent.findAll()


  res.render("site/add-student", {
    title: "Yeni öğrenci kaydı",
    groups: groups,
    parents: parents,
    alert: alert,
    errors: errors,
    csrfToken: req.csrfToken(),
  })
});

module.exports.addStudentPost = asyncHandler(async (req, res, next) => {
  const {
    studentFullName,
    groupId,
    studentTelephoneNumber,
    studentBirthDate,
    tc,
    parentId,
    parentFullName,
    parentTelephoneNumber
  } = req.body
  let parent = parentId

  let student = await Student.create({
    fullName: studentFullName.toUpperCase(),
    tcNo: tc,
    telephoneNumber: studentTelephoneNumber.trim(),
    dateOfBirth: studentBirthDate,
    groupId: groupId,
  })

  function generatePassword() {
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += Math.floor(Math.random() * 10); // 0 ile 9 arasında rastgele bir sayı ekle
    }
    return password;
  }

  if (!parentId || parentId == -1) {
    let newParentUsername = await generatePassword()
    let newParentPassword = await generatePassword()
    let parentRole = await Role.findOne({
      where: {
        name: "Parent"
      }
    })
    const parentUser = await User.create({
      username: newParentUsername.toUpperCase(),
      password: newParentPassword,
      roleId: parentRole.id
    })
    let newParent = await Parent.create({
      fullName: parentFullName.toUpperCase(),
      telephoneNumber: parentTelephoneNumber,
      userId: parentUser.id
    })
    await client.messages
      .create({
        body: `Sayın ${parentFullName.toUpperCase()}, dershane kaydı başarıyla gerçekleşmiştir.\nBilgi Yönetim Sistemi ile velisi olduğunuz öğrencilerin bilgilerini kontrol edebilirsiniz giriş bilgileriniz aşağıdaki gibidir\nKullanıcı adı: ${newParentUsername}\nŞifre: ${newParentPassword}`,
        from: process.env.TWILIO_NUMBER,
        to: `+90${parentTelephoneNumber}`
      })
      .then(message => console.log(message.sid))
      .catch();
    parent = newParent.id
  }
  let studentRole = await Role.findOne({
    where: {
      name: "Student"
    }
  })

  const newStudentPassword = await generatePassword()

  await client.messages
    .create({
      body: `Sayın ${studentFullName.toUpperCase()}, dershanemize kaydınız başarıyla gerçekleşmiştir.\nBilgi Yönetim Sistemi giriş bilgileriniz aşağıdaki gibidir\nKullanıcı adı: ${tc}\nŞifre: ${newStudentPassword}`,
      from: process.env.TWILIO_NUMBER,
      to: `+90${studentTelephoneNumber}`
    })
    .then(message => console.log(message.sid))
    .catch();


  let user = await User.create({
    username: tc,
    password: newStudentPassword,
    roleId: studentRole.id
  })

  let alert = {
    message: "Öğrenci kaydı başarıyla gerçekleşti",
    type: "success",
  };
  req.session.alert = alert;
  return res.redirect("/add/student")
});

module.exports.addTeacherGet = asyncHandler(async (req, res, next) => {
  const alert = req.session.alert;
  const errors = req.session.errors;
  delete req.session.alert;
  delete req.session.errors;

  let branches = await Branch.findAll()

  res.render("site/add-teacher", {
    title: "Yeni öğretmen kaydı",
    branches: branches,
    alert: alert,
    errors: errors,
    csrfToken: req.csrfToken(),
  })
});

module.exports.addTeacherPost = asyncHandler(async (req, res, next) => {
  const {
    teacherFullName,
    branchId,
    teacherTelephoneNumber,
    teacherBirthDate,
    tc,
  } = req.body
  const teacher = await Teacher.create({
    fullName: teacherFullName,
    telephoneNumber: teacherTelephoneNumber,
    dateOfBirth: teacherBirthDate,
    tcNo: tc,
    branchId: branchId
  })

  let alert = {
    message: "Öğretmen kaydı başarıyla gerçekleşti",
    type: "success",
  };

  req.session.alert = alert;
  return res.redirect("/add/teacher")
});

module.exports.addParentGet = asyncHandler(async (req, res, next) => {
  const alert = req.session.alert;
  const errors = req.session.errors;
  delete req.session.alert;
  delete req.session.errors;


  res.render("site/add-parent", {
    title: "Yeni veli kaydı",
    alert: alert,
    errors: errors,
    csrfToken: req.csrfToken(),
  })
});

module.exports.addParentPost = asyncHandler(async (req, res, next) => {
  const {
    parentFullName,
    parentTelephoneNumber,
  } = req.body

  const parent = await Parent.create({
    fullName: parentFullName,
    telephoneNumber: parentTelephoneNumber,
  })

  let alert = {
    message: "Veli kaydı başarıyla gerçekleşti",
    type: "success",
  };

  req.session.alert = alert;
  return res.redirect("/add/parent")
});
module.exports.addGroupGet = asyncHandler(async (req, res, next) => {
  const alert = req.session.alert;
  const errors = req.session.errors;
  delete req.session.alert;
  delete req.session.errors;

  let fields = await Field.findAll()
  let classes = await Class.findAll()
  let levels = await Level.findAll()
  let teachers = await Teacher.findAll()

  res.render("site/add-group", {
    title: "Grup oluştur",
    alert: alert,
    errors: errors,
    fields: fields,
    classes: classes,
    levels: levels,
    teachers: teachers,
    csrfToken: req.csrfToken(),
  })
});

module.exports.addGroupPost = asyncHandler(async (req, res, next) => {
  const {
    groupName,
    fieldId,
    groupId,
    classId,
    teacherId,
    levelId,
  } = req.body

  const group = await Group.create({
    name: groupName,
    fieldId: fieldId,
    groupId: groupId,
    levelId: levelId,
    teacherId: teacherId,
    classId: classId,
  })

  let alert = {
    message: "Grup kaydı başarıyla gerçekleşti",
    type: "success",
  };

  req.session.alert = alert;
  return res.redirect("/add/group")
});
