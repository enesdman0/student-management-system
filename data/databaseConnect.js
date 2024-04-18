const { Sequelize } = require('sequelize');

// Sequelize bağlantısını oluştur
const sequelize = new Sequelize(process.env.DB, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    define:{
        timestamps:false
    }
});
const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Veritabanı bağlantısı başarılı.');
    } catch (error) {
        console.error('Veritabanı bağlantısı başarısız:', error);
    }
};

module.exports = {
    sequelize,
    connectDB
};