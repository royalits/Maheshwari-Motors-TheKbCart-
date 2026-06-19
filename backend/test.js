import bcrypt from "bcryptjs";

const pass = "Gst@1234";
console.log(bcrypt.hashSync(pass, 10));