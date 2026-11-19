import crypto from 'crypto';

const encrypted = 'c1606b7c174540f61d3542a0f8cfe098:a05c8c62831b57b24871d941c6a0e4d4:fc671e2ecbe89b75433930f9186e74982485d1b6c5f78d1d8543d4177871d85fd54bef07445a111546b908c069a58788e915376a7c236adec6996fa016434734bcb16bff62a07e549dc948950fbb59ab0b34241286e9dc56623febb797515ceba00bd679c53d7230db31b5efd5c0a3';
const token = 'wxk_live_d7839f38ec3942157d520e2a4f9bdb93884afb3e6b648c24cead6d5a0a631ff3';

const [ivHex, authTagHex, encryptedData] = encrypted.split(':');
const key = crypto.scryptSync(token, 'wxkanban-kit-salt', 32);
const iv = Buffer.from(ivHex, 'hex');
const authTag = Buffer.from(authTagHex, 'hex');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);
let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
decrypted += decipher.final('utf8');
console.log(decrypted);
