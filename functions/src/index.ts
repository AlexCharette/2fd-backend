import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {CloudTasksClient} from '@google-cloud/tasks';
import {sendUnresponsiveList,
  sendResponseChangeRequest,
  notifyOfResponseChangeGranted} from './mailing';
import {google} from '@google-cloud/tasks/build/protos/protos';

admin.initializeApp();

interface VemReminderPayload {
  vemId: String,
  name: String,
}

exports.sendUnresponsiveList = sendUnresponsiveList;
exports.sendResponseChangeRequest = sendResponseChangeRequest;
exports.notifyOfResponseChangeGranted = notifyOfResponseChangeGranted;

exports.updateVemAttendance = functions.runWith({memory: '128MB'}).firestore
  .document('responses/{responseId}')
  .onCreate(async (snap) => {
    const response = snap.data();
    const {vemId, answer} = response;

    if (answer != 'yes') return;

    const vemRef = admin.firestore().doc(`vem/${vemId}`);
    vemRef.update({numParticipants: admin.firestore.FieldValue.increment(1)})
      .then((result) => {
        console.log('Successfully updated attendance count at: ', result);
      })
      .catch((err) => {
        console.log('Write failed with: ', err);
      });

    // const bulkWriter = admin.firestore().bulkWriter();

    // await bulkWriter
    //   .set(
    //     documentRef,
    //     {numParticipants: admin.firestore.FieldValue.increment(1)},
    //   )
    //   .then((result) => {
    //     console.log('Successfully updated attendance count at: ', result);
    //   })
    //   .catch((err) => {
    //     console.log('Write failed with: ', err);
    //   });
  });

exports.onUpdateResponse = functions
  .runWith({memory: '128MB'}).firestore
  .document('responses/{responseId}')
  .onUpdate(async (snap) => {
    const oldResponse = snap.before.data();
    const response = snap.after.data();
    const {vemId, answer} = response;
    const vemRef = admin.firestore().doc(`vems/${vemId}`);

    if (answer == 'seen') {
      return;
    } else if (answer == 'yes') {
      vemRef.update({numParticipants: admin.firestore.FieldValue.increment(1)})
        .then((result) => {
          console.log('Successfully updated attendance count at: ', result);
        })
        .catch((err) => {
          console.log('Write failed with: ', err);
        });
    } else if (oldResponse.answer == 'yes' && answer == 'no') {
      const vem = (await vemRef.get()).data();
      if (vem?.numParticipants == 0) return;
      vemRef.update({numParticipants: admin.firestore.FieldValue.increment(-1)})
        .then((result) => {
          console.log('Successfully updated attendance count at: ', result);
        })
        .catch((err) => {
          console.log('Write failed with: ', err);
        });
    }
  });

exports.onCreateVem = functions
  .runWith({memory: '128MB'}).firestore
  .document('vems/{vemId}')
  .onCreate(async (snap) => {
    const vem = snap.data();
    const lockDate: Date = vem.lockDate.toDate();

    const project = JSON.parse(process.env.FIREBASE_CONFIG!).projectId;
    const location = 'us-central1';
    const queue = 'vem-reminder';

    const tasksClient = new CloudTasksClient();
    const parent = tasksClient.queuePath(project, location, queue);
    const url = `https://${location}-${project}.cloudfunctions.net/remindOfVem`;

    const name = vem.name;
    const id = snap.id;
    const payload: VemReminderPayload = {
      vemId: id,
      name,
    };

    lockDate.setDate(lockDate.getDate() - 1);
    const reminderTime = lockDate.getTime() / 1000;

    const task: google.cloud.tasks.v2beta2.ITask = {
      appEngineHttpRequest: {
        httpMethod: google.cloud.tasks.v2beta2.HttpMethod.POST,
        relativeUrl: url,
        payload: Buffer.from(JSON.stringify(payload)).toString('base64'),
        headers: {
          'Content-Type': 'application/json',
        },
      },
      scheduleTime: {
        seconds: reminderTime,
      },
    };

    await tasksClient.createTask({parent, task})
      .then((response) => {
        console.log('Scheduled reminder:', response);
      }).catch((error) => {
        console.log('Error creating task:', error);
      });

    const newVemPayload: admin.messaging.MessagingPayload = {
      notification: {
        title: 'New VEM',
        body: `${vem.name}`,
        icon: 'app_icon',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
      },
      data: {
        type: 'new_vem',
        vemId: `${snap.id}`,
      },
    };

    // Notify members
    admin.messaging().sendToTopic('vems', newVemPayload)
      .then((response) => {
        console.log('Successfully sent message:', response);
      })
      .catch((error) => {
        console.log('Error sending message:', error);
      });
  });

exports.remindOfVem = functions.runWith({memory: '128MB'})
  .https.onRequest(async (request, response) => {
    const {id, name} = request.body;

    const payload: admin.messaging.MessagingPayload = {
      notification: {
        title: 'A VEM will be locked soon',
        body: `${name}`,
        icon: 'app_icon',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
      },
      data: {
        type: 'vem_reminder',
        vemId: `${id}`,
      },
    };

    admin.messaging().sendToTopic('vems', payload)
      .then((response) => {
        console.log('Successfully sent message:', response);
      })
      .catch((error) => {
        console.log('Error sending message:', error);
      });
  });
