const _ = require('lodash');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const Alert = require('../models/Alert');

const User = require('../models/User');
const userController = require('../controllers/user');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

/**
 * Sign in using Email and Password.
 */
passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
  User.findOne({ email: email.toLowerCase() }, (err, user) => {
    if (!user) {
      return done(null, false, { msg: `Email ${email} not found.` });
    }
    user.comparePassword(password, (err, isMatch) => {
      if (isMatch) {
        return done(null, user);
      }
      return done(null, false, { msg: 'Invalid email or password.' });
    });
  });
}));

/**
 * OAuth Strategy Overview
 *
 * - User is already logged in.
 *   - Check if there is an existing account with a provider id.
 *     - If there is, return an error message. (Account merging not supported)
 *     - Else link new OAuth account with currently logged-in user.
 * - User is not logged in.
 *   - Check if it's a returning user.
 *     - If returning user, sign in and we are done.
 *     - Else check if there is an existing account with user's email.
 *       - If there is, return an error message.
 *       - Else create a new account.
 */

/**
 * Sign in with Facebook.
 */
if (process.env.FACEBOOK_ID && process.env.FACEBOOK_SECRET) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_ID,
    clientSecret: process.env.FACEBOOK_SECRET,
    callbackURL: process.env.BASE_PATH + 'auth/facebook/callback',
    profileFields: ['name', 'email', 'link', 'locale', 'timezone'],
    passReqToCallback: true
  }, (req, accessToken, refreshToken, profile, done) => {
    if (req.user) {
      User.findOne({ facebook: profile.id }, (err, existingUser) => {
        if (existingUser) {
          let msg = 'There is already a Facebook account that belongs to you. Sign in with that account or delete it, then link it with your current account.';
          Alert.flash(req, msg, err);
          done(err);
        } else {
          User.findById(req.user.id, (err, user) => {
            user.facebook = profile.id;
            user.tokens.push({ kind: 'facebook', accessToken });
            user.profile.name = user.profile.name || profile.name.givenName + ' ' + profile.name.familyName;
            user.profile.gender = user.profile.gender || profile._json.gender;
            user.profile.picture = user.profile.picture || `https://graph.facebook.com/${profile.id}/picture?type=large`;
            user.save((err) => {
              req.flash('info', { msg: 'Facebook account has been linked.' });
              done(err, user);
            });
          });
        }
      });
    } else {
      User.findOne({ facebook: profile.id }, (err, existingUser) => {
        if (existingUser) {
          return done(null, existingUser);
        }
        User.findOne({ email: profile._json.email }, (err, existingEmailUser) => {
          if (existingEmailUser) {
            let msg = 'There is already an account using this email address. Sign in to that account and link it with Facebook manually from Account Settings.';
            Alert.flash(req, msg, err);
            done(err);
          } else {
            const newUser = new User();
            newUser.email = profile._json.email;
            newUser.facebook = profile.id;
            newUser.tokens.push({ kind: 'facebook', accessToken });
            newUser.profile.name = profile.name.givenName + ' ' + profile.name.familyName;
            newUser.profile.gender = profile._json.gender;
            newUser.profile.picture = `https://graph.facebook.com/${profile.id}/picture?type=large`;
            newUser.profile.location = (profile._json.location) ? profile._json.location.name : '';

            userController.createUser(newUser, (user, err) => {
              done(err, user);
            });
          }
        });
      });
    }
  }));
}

/**
 * Sign in with Google.
 */
if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_ID,
    clientSecret: process.env.GOOGLE_SECRET,
    callbackURL: process.env.BASE_PATH + 'auth/google/callback',
    passReqToCallback: true
  }, (req, accessToken, refreshToken, profile, done) => {
    if (req.user) {
      User.findOne({ google: profile.id }, (err, existingUser) => {
        if (existingUser) {
          let msg = 'There is already a Google account that belongs to you. Sign in with that account or delete it, then link it with your current account.' ;
          Alert.flash(req, msg, err);
          done(err);
        } else {
          User.findById(req.user.id, (err, user) => {
            user.google = profile.id;
            user.tokens.push({ kind: 'google', accessToken });
            user.profile.name = user.profile.name || profile.displayName;
            user.profile.gender = user.profile.gender || profile._json.gender;
            user.profile.picture = user.profile.picture || profile._json.image.url;
            user.save((err) => {
              req.flash('info', { msg: 'Google account has been linked.' });
              done(err, user);
            });
          });
        }
      });
    } else {
      User.findOne({ google: profile.id }, (err, existingUser) => {
        if (existingUser) {
          return done(null, existingUser);
        }
        User.findOne({ email: profile.emails[0].value }, (err, existingEmailUser) => {
          if (existingEmailUser) {
            let msg = 'There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings.';
            Alert.flash(req, msg, err);
            done(err);
          } else {
            const newUser = new User();
            newUser.email = profile.emails[0].value;
            newUser.google = profile.id;
            newUser.tokens.push({ kind: 'google', accessToken });
            newUser.profile.name = profile.displayName;
            newUser.profile.gender = profile._json.gender;
            newUser.profile.picture = profile._json.image.url;

            userController.createUser(newUser, (user, err) => {
              done(err, user);
            });
          }
        });
      });
    }
  }));
}

/**
 * Login Required middleware.
 */
exports.isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect(process.env.BASE_PATH + 'login');
};

/**
 * Authorization Required middleware.
 */
exports.isAuthorized = (req, res, next) => {
  const provider = req.path.split('./').slice(-1)[0];

  if (_.find(req.user.tokens, { kind: provider })) {
    next();
  } else {
    res.redirect(`/auth/${provider}`);
  }
};
