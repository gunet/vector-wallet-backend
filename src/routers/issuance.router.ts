
import express, { Router } from 'express';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import _ from 'lodash';
import { appContainer } from '../services/inversify.config';
import { CredentialReceiving } from '../services/interfaces';
import { TYPES } from '../services/types';


const openidForCredentialIssuanceService = appContainer.get<CredentialReceiving>(TYPES.CredentialReceiving);

/**
 * "/issuance"
 * This controller will be used on the issuance phase
 */
const issuanceRouter: Router = express.Router();
issuanceRouter.use(AuthMiddleware);


issuanceRouter.post('/generate/authorization/request', async (req, res) => {
	console.info("Received initiation")
	try {
		const {
			legal_person_did,
		} = req.body;
		const result = await openidForCredentialIssuanceService.generateAuthorizationRequestURL(req.user.username, null, legal_person_did);
		res.send(result);
	}
	catch(err) {
		res.status(500).send({});
	}

})

issuanceRouter.post('/generate/authorization/request/with/offer', async (req, res) => {
	try {
		const {
			credential_offer_url,
		} = req.body;

		const result = await openidForCredentialIssuanceService.generateAuthorizationRequestURL(req.user.username, credential_offer_url, null);
		res.send(result);
	}
	catch(err) {
		return res.status(500).send({});
	}

})

issuanceRouter.post('/handle/authorization/response', async (req, res) => {
	try {
		const {
			authorization_response_url
		} = req.body;


		if (!(new URL(authorization_response_url).searchParams.get("code"))) {
			return res.status(500).send({});
		}
		await openidForCredentialIssuanceService.handleAuthorizationResponse(req.user.username, authorization_response_url);
		res.send({});
	}
	catch(err) {
		res.status(500).send({ error: "Failed to handle authorization response" });
	}

})

issuanceRouter.post('/request/credentials/with/pre_authorized', async (req, res) => {
	try {
		const {
			user_pin
		} = req.body;

		await openidForCredentialIssuanceService.requestCredentialsWithPreAuthorizedGrant(req.user.username, user_pin);
		res.send({});
	}
	catch(err) {
		res.status(500).send({ error: "Failed to handle authorization response" });
	}

})

export {
	issuanceRouter
}