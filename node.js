const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback" // Fixed: Added /api prefix
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if email exists
      if (!profile.emails || !profile.emails[0]) {
        return done(new Error('No email found in Google profile'), null);
      }

      const email = profile.emails[0].value;
      
      // Find user by Google ID or email
      let user = await User.findOne({ 
        $or: [
          { googleId: profile.id },
          { email: email }
        ]
      });
      
      if (user) {
        // Update existing user with Google info if not already linked
        if (!user.googleId) {
          user.googleId = profile.id;
          user.avatar = profile.photos?.[0]?.value || user.avatar;
          await user.save();
        }
      } else {
        // Create new user
        user = await User.create({
          googleId: profile.id,
          name: profile.displayName,
          email: email,
          avatar: profile.photos?.[0]?.value,
          password: Math.random().toString(36).slice(-8), // Random password for OAuth users
          isVerified: true // Google users are pre-verified
        });
      }
      
      return done(null, user);
    } catch (err) {
      console.error('Google Auth Error:', err);
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;