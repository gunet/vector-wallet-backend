
import { NaturalPersonWallet, Verify } from '@gunet/ssi-pack';
import axios from 'axios';
import express, { Request, Response, Router } from 'express';
import config from '../../config';
import { SignVerifiablePresentationJWT } from '@gunet/ssi-pack'
import { getUserByDID } from '../entities/user.entity';
import { importJWK } from 'jose';
import { IdentifierService } from '../services/IdentifierService';
import { verifiablePresentationSchemaURL } from '../util/util';
/**
 * "/signing"
 * This controller will be used on the issuance phase
 */
const signingRouter: Router = express.Router();

const identifierService = new IdentifierService();

signingRouter.post('/vp', async (req: Request, res: Response) => {
	const { verifiableCredential, aud, nonce } = req.body;
	if (req.user == undefined) {
		res.status(401).send();
		return;
	}
	
	const wallet = await identifierService.getNaturalPersonWalletByUsername(req.user.username)
	const vp_jwt = await new SignVerifiablePresentationJWT()
		.setIssuer(req.user.did)
		.setAudience(aud)
		.setCredentialSchema(verifiablePresentationSchemaURL)
		.setExpirationTime(1000)
		.setNonce(nonce)
		.setVerifiableCredential(verifiableCredential)
		.sign(await importJWK(wallet.key.privateKey));

	res.status(200).send({ vp_jwt });

});


export {
	signingRouter
}