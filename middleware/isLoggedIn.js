// middleware/isloggedin.js
module.exports = (req, res, next) => {
    // 🔐 Check: Agar user fully verified (Face + Password) nahi hai
    if (!req.session?.user) {
        // Agar tempUser mojood hai (matlab password de chuka hai lekin verify nahi kiya)
        // aur wo aage kisi page par jane ki koshish kar raha hai, toh session destroy karein 
        // taake wo bilkul shuru se (Login page se) aaye.
        if (req.session?.tempUser) {
            req.session.destroy(); 
        }
        return res.redirect('/signin'); 
    }

    // ✅ User is fully verified, proceed
    next();
};