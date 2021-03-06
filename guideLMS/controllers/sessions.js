const Session = require('../models/Session');
const Student = require('../models/Student');
const StudentController = require('../controllers/student');
const paginate = require('express-paginate');
const MongoQS = require('mongo-querystring');
const Audit = require('../models/Audit');
const Alert = require('../models/Alert');

/**
 * GET /
 * Sessions page.
 */
exports.index = (req, res) => {
  var qs = new MongoQS();
  let filter = qs.parse(req.query);
  let studentId = filter.hasOwnProperty('studentId') ? filter.studentId : undefined;

  let itemCount = 0;
  Session.count(filter)
    .then((resultsCount) => {
        itemCount = resultsCount;
        return Session.find(filter).sort({startTime: -1}).limit(req.query.limit).skip(req.skip).exec();
    })
    .then((sessions) => {
      const pageCount = Math.ceil(itemCount / req.query.limit);

      res.render('sessions', {
        title: 'Sessions',
        sessions: sessions,
        studentId: studentId,
        filter: filter,
        pageCount,
        itemCount,
        pages: paginate.getArrayPages(req)(10, pageCount, req.query.page)
      })
    })
    .catch((err) => {
      Alert.flash(req, 'Unable to display sessions page', err);
      res.render('error');
    });
};

exports.post = (req, res) => {
  if (req.body.action == 'deactivateAll') {
    console.info("Deactivate all sessions.");
    Audit.record(req.user.email, 'deactivate', 'active sessions');
    Session.find({active: true}).exec()
      .then((sessions) => {
        for (let session of sessions) {
          exports.deactivate(session);
        }
        return res.redirect(process.env.BASE_PATH + 'sessions');
      }).catch((err) => {
        Alert.flash(req, 'Unable to deactivate sessions', err);
        res.redirect('back');
      });
  }
};

exports.delete = (req, res) => {
  if (req.body.action == 'delete') {
    console.info("Delete all sessions.");
    Audit.record(req.user.email, 'deleted', 'all sessions');
    Session.remove({}).then(() => {
      return res.redirect(process.env.BASE_PATH + 'sessions');
    }).catch((err) => {
      Alert.flash(req, 'Unable to delete sessions', err);
      res.redirect('back');
    });
  }
};

exports.deactivate = (session) => {
  console.info("Session deactivate");
  session.active = false;
  if (session.events.length > 0) {
    session.endTime = session.events[session.events.length-1].time;
  } else {
    session.endTime = Date.now();
  }
  return session.save()
    .then(() => {
        if (Student.isTempUser(session.studentId)) {
          console.info("Delete temp user");
          return StudentController.deleteStudent(session.studentId);
        } else {
          return Promise.resolve();
        }
    });
}