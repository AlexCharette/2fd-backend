import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as FirebaseFirestore from '@google-cloud/firestore';
// import * as mailer from 'nodemailer';

export const sendUnresponsiveList = functions
  .runWith({memory: '128MB'}).https
  .onRequest(
    async (request: functions.https.Request, response: functions.Response) => {
      //  TODO check if vem capacity was not reached
      const vemId: String = 'nvThBuApHZDSzSpvomfu';// req.body.vemId;
      const userIds: Set<string> = new Set();
      const users: Set<Array<[string, any]>> = new Set();
      const vemResponseUserIds: Set<string> = new Set();

      await admin.firestore()
        .collection('users')
        .get()
        .then((querySnapshot) => {
          querySnapshot.forEach((documentSnapshot) => {
            userIds.add(documentSnapshot.id);

            const data: Object = documentSnapshot.data();
            const temp: Array<[string, any]> = [];
            temp.push(['id', documentSnapshot.id]);
            for (const [key, value] of Object.entries(data)) {
              if (key == 'lastName' || key == 'lastThree') {
                temp.push([key, value]);
              }
            }
            console.log(temp);
            users.add(temp);
          });
        })
        .catch((error) => {
          console.log(error);
          response.status(500).send(error);
        });


      await admin.firestore()
        .collection('responses')
        .where('vemId', '==', vemId)
        .where('answer', '!=', 'seen')
        .get()
        .then(
          (querySnapshot) => {
            querySnapshot.forEach((documentSnapshot) => {
              const data: Object = documentSnapshot.data();
              const id = Object.entries(data)
                .find((entry) => entry[0] == 'id')?.[1];
              vemResponseUserIds.add(id);
            });
          });

      // Get all users whose id is not found in the responses
      const unresponsiveUserIds: Array<string> = Array.from(new Set(
        [...userIds]
          .filter((id) => vemResponseUserIds.has(id))
      ));

      const unresponsiveUsers: Array<Array<[string, any]>> = [];

      unresponsiveUserIds.forEach((id: String, index: number) => {
        const currentUser: any = Array.from(users)[index];
        if (currentUser['id'] == id) {
          unresponsiveUsers.push(currentUser);
          console.log(`unresponsive user added: ${id}`);
        }
      });

      let unresponsiveUserText: String = '';

      unresponsiveUsers.forEach((userAttrs) => {
        userAttrs.forEach((attr) => {
          unresponsiveUserText += `${attr[1]} `;
        });
        unresponsiveUserText += '\n';
      });

      if (unresponsiveUserText == '') {
        unresponsiveUserText = 'This vem was answered by all members.';
      }

      // TODO Send email
      // let transporter = mailer.createTransport(
      //   `smtps://acharette.dev%40gmail.com:0p3r4t10ns1%21@smtp.gmail.com`
      // );

      // const mailOptions = {
      //     from: 'acharette.dev@gmail.com',
      //     to: 'acharette.wake@gmail.com',
      //     subject: 'Cloud functions test',
      //     text: 'Hiiiiii',
      // };

      // transporter.sendMail(mailOptions, (error, info) => {
      //     if (error) console.log(error);
      //     else console.log(`Email sent: ${info.response}`);
      // });

      response.status(200).send('Email sent');
    });

export const sendResponseChangeRequest = functions
  .runWith({memory: '128MB'}).firestore
  .document('responseChanges/{changeId}')
  .onCreate(async (snap) => {
    const responseChange = snap.data();
    const detId = responseChange.detId;

    // let icId = '';
    // let twoIcId = '';

    // Get IC & 2IC from detId
    await admin.firestore()
      .collectionGroup('detachments')
      .where(FirebaseFirestore.FieldPath.documentId(), '==', detId)
      .limit(1)
      .get()
      .then(
        (querySnapshot) => {
          querySnapshot.forEach((documentSnapshot) => {
            // const data = documentSnapshot.data();
            // icId = data.icId;
            // twoIcId = data.twoIcId;
          });
        });

    // const icRef = await admin.firestore().doc(`users/${icId}`).get();
    // const twoIcRef = await admin.firestore().doc(`users/${twoIcId}`).get();

    // let icEmail = icRef.data()?.email;
    // let twoIcEmail = twoIcRef.data()?.email;

    // TODO Send email to ic & 2ic
    // let transporter = mailer.createTransport(
    //   `smtps://acharette.dev%40gmail.com:0p3r4t10ns1%21@smtp.gmail.com`
    // );

    // const mailOptions = {
    //     from: 'acharette.dev@gmail.com',
    //     to: 'acharette.wake@gmail.com',
    //     subject: 'Cloud functions test',
    //     text: 'Hiiiiii',
    // };

    // transporter.sendMail(mailOptions, (error, info) => {
    //     if (error) console.log(error);
    //     else console.log(`Email sent: ${info.response}`);
    // });
  });

export const notifyOfResponseChangeGranted = functions
  .runWith({memory: '128MB'}).firestore
  .document('responseChanges/{changeId}')
  .onUpdate(async (snap) => {
    const newData = snap.after.data();

    if (newData.granted != true) return;

    const newAnswer = newData.newAnswer;
    const responseId = newData.responseId;

    // write change to corresponding request
    const bulkWriter = admin.firestore().bulkWriter();
    const documentRef = admin.firestore().doc(`responses/${responseId}`);
    await bulkWriter
      .set(documentRef, {answer: newAnswer})
      .then((result) => {
        console.log('Successfully executed write at: ', result);
      })
      .catch((err) => {
        console.log('Write failed with: ', err);
      });

    // TODO Send notification to requesting user device

    // TODO Send email to command
    // let transporter = mailer.createTransport(
    //   `smtps://acharette.dev%40gmail.com:0p3r4t10ns1%21@smtp.gmail.com`
    // );

    // const mailOptions = {
    //     from: 'acharette.dev@gmail.com',
    //     to: 'acharette.wake@gmail.com',
    //     subject: 'Cloud functions test',
    //     text: 'Hiiiiii',
    // };

    // transporter.sendMail(mailOptions, (error, info) => {
    //     if (error) console.log(error);
    //     else console.log(`Email sent: ${info.response}`);
    // });
  });
