import express, { Express, Request, Response } from 'express';
import config from '../config';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import userController from './routers/user.router';
import { AuthMiddleware } from './middlewares/auth.middleware';
import { statusRouter } from './routers/status.router';
import { issuanceRouter } from './routers/issuance.router';
import { signingRouter } from './routers/signing.router';
import { storageRouter } from './routers/storage.router';
import { presentationRouter } from './routers/presentation.router';
import { getAllUsers } from './entities/user.entity';
import { NaturalPersonWallet } from '@gunet/ssi-pack';

const app: Express = express();
// __dirname is "/path/to/dist/src"

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static('public'));
// __dirname is "/path/to/dist/src"
// public is located at "/path/to/dist/src"
app.use(cors({ credentials: true, origin: true }));


// define routes and middleware here
app.use('/status', statusRouter);
app.use('/user', userController);
app.get('/jwks', async (req, res) => {
	const users = await getAllUsers();
	if (users.err) {
		return res.status(500).send({});
	}

	const jwksPromises = users.unwrap().map(async (user) => {
		const keys = JSON.parse(user.keys);
		const w = await NaturalPersonWallet.initializeWallet(keys);
		const did = w.key.did
		return { ...w.getPublicKey(), kid: did };
	})
	const jwks = await Promise.all(jwksPromises);
	return res.send(jwks);
})

app.use(AuthMiddleware);

// all the following endpoints are guarded by the AuthMiddleware
app.use('/issuance', issuanceRouter);
app.use('/signing', signingRouter);
app.use('/storage', storageRouter);
app.use('/presentation', presentationRouter);




app.listen(config.port, () => {
	console.log(`eDiplomas Register app listening at ${config.url}`)
});
