import express, { Router } from 'express';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import fetch from 'node-fetch'
import { z } from 'zod';
import { appContainer } from '../services/inversify.config';
import { PresentationSending } from '../services/interfaces';
import { TYPES } from '../services/types';

const openidForPresentationService = appContainer.get<PresentationSending>(TYPES.PresentationSending);


const authorizationRequestSchema = z.object({
	client_id: z.string(),
	response_type: z.string(),
	scope: z.string(),
	redirect_uri: z.string(),
	request: z.string().optional()
});


/**
 * "/presentation"
 * This controller will be used on the presentation phase
 */
const presentationRouter: Router = express.Router();
presentationRouter.use(AuthMiddleware);


presentationRouter.post('/handle/id_token/request', async (req, res) => {
	const {
		authorization_request
	} = req.body;

	const url = new URL(authorization_request);
	const params = new URLSearchParams(url.search);
  const paramEntries = [...params.entries()];

  const jsonParams = Object.fromEntries(paramEntries);


	try{
		authorizationRequestSchema.parse(jsonParams);

		const result = await openidForPresentationService.parseIdTokenRequest(req.user.did, req.user.username, authorization_request);
		console.log("Result = ", result)
		res.send(result);
	}
	catch(error) {
		const errText = `Error parsing id token request request: ${error}`;
		res.status(500).send({error: errText});
		return;
	}

})

presentationRouter.post('/handle/authorization/request', async (req, res) => {
	const {
		authorization_request
	} = req.body;

	const url = new URL(authorization_request);
	const params = new URLSearchParams(url.search);
  const paramEntries = [...params.entries()];

  const jsonParams = Object.fromEntries(paramEntries);

	try{
		new URL(authorization_request);
	}
	catch(_) {
		res.status(400).send({error: "authorization_request body parameter must be valid URL."});
		return;
	}

	console.log("Authorization req = ", authorization_request)
	try{
		authorizationRequestSchema.parse(jsonParams)

		const { conformantCredentialsMap, verifierDomainName } = await openidForPresentationService.parseAuthorizationRequest(req.user.did, req.user.username, authorization_request);
		// convert from map to JSON
		const mapArray = Array.from(conformantCredentialsMap);
		const conformantCredentialsMapJSON = Object.fromEntries(mapArray);
		res.send({ conformantCredentialsMap: conformantCredentialsMapJSON, verifierDomainName });
	}
	catch(error) {
		const errText = `Error parsing authorization request: ${error}`;
		res.status(500).send({error: errText});
		return;
	}
})

presentationRouter.post('/generate/authorization/response', async (req, res) => {
	const {
		verifiable_credentials_map
	} = req.body;



	let redirect_uri: string, vp_token: string, presentation_submission: any;
	try {
		const { redirect_to } = await openidForPresentationService.generateAuthorizationResponse(req.user.did, req.user.username, verifiable_credentials_map);
		return res.send( { redirect_to })

	}
	catch(error) {
		const errText = `Error generating authorization response: ${error}`;
		console.error(errText);
		res.status(500).send({error: errText});
		return;
	}
})




export {
	presentationRouter
}