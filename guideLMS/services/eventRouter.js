'use strict';

const Alert = require("../models/Alert");
const sessions = require('../controllers/sessions');
const Student = require('../models/Student');
const Tutor = require('./tutor');

class EventRouter {
    constructor() {
    }

    processAsync(session, event) {
        // GroupId is set when the this.session starts, but in case the this.session has been started without an
        // open this.session, pick up the groupId from the submit message.
        if (event.context && event.context.groupId) {
            session.groupId = event.context.groupId;
        }

        // Use this to start the processing in case we need to save new session info
        let initialPromise = Promise.resolve();

        // Is this the beginning of the session?
        if (event.isMatch("SYSTEM", "STARTED", "SESSION")) {
            session.studentId = event.studentId;
            session.active = true;
            session.startTime = event.time;
            initialPromise = session.save();
        }

        var currentStudent = null;
        return initialPromise.then(() => {
            return Student.findOrCreate(session.studentId);
        })
        .then((student) => {
            currentStudent = student;
            session.logEvent(event);

            return this.handleEventAsync(student, session, event);
        })
        .then((action) => {
            // If there is a response resulting from the event, send it to the client
            if (action) {
                // Include the sequence number in the response so that the client
                // can determine whether this action is still relevant to the user.
                action.sequence = event.sequence;

                console.info("Send: {0} to userId {1} (sequence: {2})".format(
                    action.toString(),
                    action.studentId,
                    action.sequence
                ));
                session.logEvent(action);

                const actionJson = action.toJson(BiologicaX.fixOutgoingEvent);
                session.socket.emit(GuideProtocol.Event.Channel, actionJson);
            } else {
                Alert.debug("No tutoring action recommended.", session);
            }
            return Promise.resolve();
        })
        .then(() => {
            return session.save();
        })
        .then(() => {
            return currentStudent.save();
        })
        .then(() => {
            if (event.isMatch("SYSTEM", "ENDED", "SESSION")) {
                Alert.info("Session Ended", session);
                if (session && session.active) {
                    return sessions.deactivate(session);
                }
            }

            return Promise.resolve();
        });
    }

    handleEventAsync(student, session, event) {
        try {
            if (event.isMatch('SYSTEM', 'STARTED', 'SESSION')) {
                return this.handleSystemStartedSessionAsync(student, session, event);

            } else if (event.isMatch('SYSTEM', 'ENDED', 'SESSION')) {
                // Ignore this message since it is handled at the end (after save)
                return Promise.resolve(null);

            // } else if (event.isMatch('USER', 'NAVIGATED', 'CHALLENGE')) {
            //     session.debugAlert("Ignored message: " + event.toString());
            //     return Promise.resolve(null);

            } else if (event.isMatch('USER', '*', '*')) {
                // Evaluate user actions and potentially take tutoring action
                let tutor = new Tutor(student, session);
                return tutor.processAsync(event);

            } else {
                Alert.warning("Unhandled message: " + event.toString(), session);
                return Promise.resolve(null);
            }
        } catch(err) {
            return  Promise.reject(err);
        }
    }

    handleSystemStartedSessionAsync(student, session, event) {

        Alert.info("Session Started", session);

        return new Promise((resolve, reject) => {

            if (!event.context.hasOwnProperty("classId") || !event.context.classId) {
                if (Student.isTempUser(session.studentId)) {
                    event.context.classId = "TEMP";
                } else {
                    // rgtaylor 2019-04-09 Missing classId should be rejected, since it
                    // is specified as required in the protocol spec. However, the client
                    // doesn't always send a classId.
                    event.context.classId = "NOT-SENT-BY-CLIENT";
                    //reject(new Error("context.classId is missing or undefined"));
                    //return;
                }
            }

            if (!event.context.hasOwnProperty("groupId") || !event.context.groupId) {
                reject(new Error("student.groupId is missing or undefined"));
                return;
            }

            student.lastSignIn = new Date(event.time);
            student.classId = event.context.classId;
            student.groupId = event.context.groupId;
            student.learnPortalEndpoint = event.context.itsDBEndpoint;
            student.totalSessions++;

            session.classId = event.context.classId;
            session.groupId = event.context.groupId;

            resolve();
        });
    }
}

module.exports = EventRouter;
