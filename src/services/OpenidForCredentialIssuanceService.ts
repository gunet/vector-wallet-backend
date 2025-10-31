import axios from "axios";
import { LegalPersonEntity, getLegalPersonByDID, getLegalPersonByUrl } from "../entities/LegalPerson.entity";
import { AuthorizationDetail, CredentialIssuerMetadata, CredentialOffer, CredentialResponseSchemaType, CredentialSupportedJwtVcJson, GrantType, OpenidConfiguration, TokenResponseSchemaType, VerifiableCredentialFormat } from "../types/oid4vci";
import { SignJWT, importJWK } from "jose";
import config from "../../config";
import { getUserByDID, getUserByUsername } from "../entities/user.entity";
import { IdentifierService } from "./IdentifierService";
import { sendPushNotification } from "../lib/firebase";
import { Err, None, Option, Some } from "ts-results";
import { LegalPersonService } from "./LegalPersonService";
import * as _ from 'lodash';
import { generateCodeChallengeFromVerifier, generateCodeVerifier } from "../util/util";
import base64url from "base64url";
import { createVerifiableCredential } from "../entities/VerifiableCredential.entity";
import { JSONPath } from "jsonpath-plus";
import { getLeafNodesWithPath } from "../lib/leafnodepaths";
import { randomUUID } from "node:crypto";
import { NaturalPersonWallet } from "@gunet/ssi-pack";
import qs from "qs";
import { TYPES } from "./types";
import { CredentialReceiving, IdentifierStore, LegalPersonsRegistry  } from "./interfaces";
import { injectable, inject } from "inversify";
import "reflect-metadata";


type IssuanceState = {
	username: string;  // Before Authorization Req
	legalPerson: LegalPersonEntity; // Before Authorization Req
	credentialIssuerMetadata: CredentialIssuerMetadata; // Before Authorization Req
	openidConfiguration: OpenidConfiguration; // Before Authorization Req
	issuer_state?: string; // parameter from the authorization request
	authorization_details: CredentialSupportedJwtVcJson[]; // This is defined before the Authorization Req, and after the Token Response (if available)
	code_verifier?: string;
	code?: string; // set at Authorization Response
	grant_type: GrantType,
	tokenResponse?: TokenResponseSchemaType; // set at Token Response
	credentialResponses?: CredentialResponseSchemaType[];  // set at Credential Response
	user_pin?: string; // for pre-authorize flow only
}

@injectable()
export class OpenidForCredentialIssuanceService implements CredentialReceiving {

	public static readonly identifier = "OpenidForCredentialIssuanceService"
	// identifierService: IdentifierService = new IdentifierService();
	// legalPersonService: LegalPersonService = new LegalPersonService();
	

	// key: username
	public states = new Map<string, IssuanceState>();


	// This is a queue of the credentials which are ready
	// to be received.
	// When a credential is ready to be received, the credential response
	// is added for specific fcm token and a notification is sent to the device.
	// key: username, value: array of credential responses
	credentialQueue = new Map<string, CredentialResponseSchemaType[]>();

	constructor(
		@inject(TYPES.IdentifierStore) private identifierService: IdentifierStore,
		@inject(TYPES.LegalPersonsRegistry) private legalPersonService: LegalPersonsRegistry
	) { }


	async getIssuerState(username: string): Promise<{ issuer_state?: string, error?: Error; }> {
		const state = this.states.get(username);
		if (!state) {
			return { issuer_state: null, error: new Error("No state found") };
		}
		if (!state.issuer_state) {
			return { issuer_state: null, error: new Error("No issuer_state found in state") };
		}
		
		return { issuer_state: state.issuer_state, error: null };
	}

	async getAvailableSupportedCredentials(legalPersonDID: string): Promise<Array<{id: string, displayName: string}>> {
		const lp = await this.legalPersonService.getByIdentifier(legalPersonDID);
		const issuerUrlString = lp.url;
		const credentialIssuerMetadata = await axios.get(issuerUrlString + "/.well-known/openid-credential-issuer");

		const options = credentialIssuerMetadata.data.credentials_supported.map((val) => {
			return { id: val.id, displayName: val.display[0].name };
		})
		return options as Array<{id: string, displayName: string}>;
	}

	/**
	 * 
	 * @param username 
	 * @param legalPersonDID 
	 * @returns 
	 * @throws
	 */
	async generateAuthorizationRequestURL(username: string, credentialOfferURL?: string, legalPersonDID?: string): Promise<{ redirect_to: string }> {
		console.log("Username = ", username)
		console.log("LP = ", legalPersonDID)
		const user = (await getUserByUsername(username)).unwrap();
		let issuerUrlString: string | null = null;
		let credential_offer = null;
		let issuer_state = null;
		const client_metadata = {
			jwks_uri: config.url + "/jwks",
			vp_formats_supported: {
				jwt_vp: {
					alg: ["ES256"]
				}
			},
			response_types_supported: [ "vp_token", "id_token" ]
		};

		const naturalPersonWallet = await NaturalPersonWallet.initializeWallet(JSON.parse(user.keys));

		let lp: LegalPersonEntity;

		if (legalPersonDID) {
			lp = (await getLegalPersonByDID(legalPersonDID)).unwrap();
			if (!lp) {
				throw "No legal person found in the DB"
			}
			console.log("Selected legal person = ", lp)
			issuerUrlString = lp.url;
		}
		else if (credentialOfferURL) {
			console.log("Credential offer url = ", credentialOfferURL)

			credential_offer = qs.parse(credentialOfferURL.split('?')[1]) as any;
			if (credential_offer.credential_offer_uri && typeof credential_offer.credential_offer_uri == 'string') {
				credential_offer = (await axios.get(credential_offer.credential_offer_uri)).data;
			}
			console.log("Credential offer = ", credential_offer)

			const credentialIssuerURL = credential_offer.credential_issuer as string;
			lp = (await getLegalPersonByUrl(credentialIssuerURL)).unwrap();
			issuerUrlString = lp.url;
			issuer_state = credential_offer?.grants.authorization_code?.issuer_state 

		}

		if (!issuerUrlString) {
			throw "No issuer url is defined"
		}

		

		const credentialIssuerMetadata = (await axios.get(issuerUrlString + "/.well-known/openid-credential-issuer")).data as CredentialIssuerMetadata;
		console.log("Credential issuer metadata")
		console.dir(credentialIssuerMetadata, { depth: null })
		const authorizationServerConfig = (await axios.get(credentialIssuerMetadata.authorization_server + "/.well-known/openid-configuration")).data;

		// all credential supported will be added into the authorization details by default
		const authorizationDetails: CredentialSupportedJwtVcJson[] = (credential_offer ? credential_offer.credentials : credentialIssuerMetadata.credentials_supported)
		.map((cred_sup) => {
			return {
				format: cred_sup.format,
				types: cred_sup.types,
				type: "openid_credential",
				locations: [ credentialIssuerMetadata.credential_issuer ]
			};
		});

		if (credential_offer && credential_offer.grants["urn:ietf:params:oauth:grant-type:pre-authorized_code"]) {
			this.states.set(username, {
				username: username,
				credentialIssuerMetadata: credentialIssuerMetadata,
				openidConfiguration: authorizationServerConfig,
				legalPerson: lp,
				authorization_details: authorizationDetails,
				issuer_state: issuer_state,
				grant_type: GrantType.PRE_AUTHORIZED_CODE,
				code: credential_offer.grants["urn:ietf:params:oauth:grant-type:pre-authorized_code"]["pre-authorized_code"]
			});
			const user_pin_required = credential_offer.grants["urn:ietf:params:oauth:grant-type:pre-authorized_code"]["user_pin_required"];
			console.log("Redirecting to ... ", config.walletClientUrl + `?preauth=true&ask_for_pin=${user_pin_required}`)
			return { redirect_to: config.walletClientUrl + `?preauth=true&ask_for_pin=${user_pin_required}` }
		}
		
		

		

		
		const authorizationRequestURL = new URL(authorizationServerConfig.authorization_endpoint);
		authorizationRequestURL.searchParams.append("scope", "openid");
		authorizationRequestURL.searchParams.append("client_id", naturalPersonWallet.key.did);
		
		authorizationRequestURL.searchParams.append("redirect_uri", config.walletClientUrl);

		authorizationRequestURL.searchParams.append("authorization_details", JSON.stringify(authorizationDetails));
		const code_verifier = generateCodeVerifier();
		const code_challenge = await generateCodeChallengeFromVerifier(code_verifier);
		authorizationRequestURL.searchParams.append("code_challenge", code_challenge);
		authorizationRequestURL.searchParams.append("code_challenge_method", "S256");
		authorizationRequestURL.searchParams.append("response_type", "code");
		authorizationRequestURL.searchParams.append("issuer_state", issuer_state);

		authorizationRequestURL.searchParams.append("client_metadata", JSON.stringify(client_metadata));
		this.states.set(username, {
			username: username,
			authorization_details: authorizationDetails,
			credentialIssuerMetadata: credentialIssuerMetadata,
			openidConfiguration: authorizationServerConfig,
			legalPerson: lp,
			code_verifier: code_verifier,
			issuer_state: issuer_state,
			grant_type: GrantType.AUTHORIZATION_CODE
		})
		console.log("generateAuthorizationRequest \n\t", authorizationRequestURL)
		return { redirect_to: authorizationRequestURL.toString() };
	}



	public async requestCredentialsWithPreAuthorizedGrant(username: string, user_pin: string) {
		let state = this.states.get(username)
		state = { ...state, user_pin: user_pin };
		this.states.set(username, state); // save state with pin

		this.tokenRequest(state).then(tokenResponse => {
			state = { ...state, tokenResponse }
			this.states.set(username, state);
			this.credentialRequests(username, state).catch(e => {
				console.error("Credential requests failed with error : ", e)
			});
		})
	}

	/**
	 * 
	 * @param authorizationResponseURL
	 * @throws
	 */
	public async handleAuthorizationResponse(username: string, authorizationResponseURL: string): Promise<void> {
		const url = new URL(authorizationResponseURL);
		const code = url.searchParams.get('code');
		if (!code) {
			throw new Error("Code not received");
		}
		const currentState = this.states.get(username);
		let newState = { ...currentState, code };
		this.states.set(username, newState);

		this.tokenRequest(newState).then(tokenResponse => {
			newState = { ...newState, tokenResponse }
			this.states.set(username, newState);
			this.credentialRequests(username, newState).catch(e => {
				console.error("Credential requests failed with error : ", e)
			});
		})
	}



	/**
	 * @throws
	 * @param state 
	 * @returns 
	 */
	private async tokenRequest(state: IssuanceState): Promise<TokenResponseSchemaType> {
		console.info("State = ", state)
		// Not adding authorization header
		// const basicAuthorizationB64 = Buffer.from(`${state.legalPerson.client_id}:${state.legalPerson.client_secret}`).toString("base64");
		const httpHeader = { 
			// "authorization": `Basic ${basicAuthorizationB64}`,
			"Content-Type": "application/x-www-form-urlencoded"
		};

		const data = new URLSearchParams();
		switch (state.grant_type) {
		case GrantType.AUTHORIZATION_CODE:
			data.append('grant_type', 'authorization_code');
			data.append('code', state.code);
			data.append('redirect_uri', config.walletClientUrl);
			data.append('code_verifier', state.code_verifier);
			const user = (await getUserByUsername(state.username)).unwrap();
			data.append('client_id', user.did);
			break;
		case GrantType.PRE_AUTHORIZED_CODE:
			data.append('grant_type', 'urn:ietf:params:oauth:grant-type:pre-authorized_code');
			data.append('pre-authorized_code', state.code);
			data.append('user_pin', state.user_pin);
			break;
		default:
			break;
		}

		
		// const clientAssertionJWT = await new SignJWT({})
		// 	.setProtectedHeader({ alg: wallet.key.alg, kid: wallet.key.did + "#" + wallet.key.did.split(':')[2] })
		// 	.setAudience(state.legalPerson.url)
		// 	.setIssuedAt()
		// 	.setIssuer(user.did)
		// 	.setSubject(user.did)
		// 	.setExpirationTime('30s')
		// 	.setJti(randomUUID())
		// 	.sign(await importJWK(wallet.getPrivateKey(), wallet.key.alg));


		// data.append('client_assertion', clientAssertionJWT);
		// data.append('client_assertion_method', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');


		const tokenEndpoint = state.openidConfiguration.token_endpoint;
		try {
			const httpResponse = await axios.post(tokenEndpoint, data, { headers: httpHeader });
			const httpResponseBody = httpResponse.data as TokenResponseSchemaType;
			return httpResponseBody;
		}
		catch(err) {
			if (err.response) {
				console.error("HTTP response error body = ", err.response.data)
			}
			throw "Token Request failed"
		}

	}

	/**
	 * @throws
	 */
	private async credentialRequests(username: string, state: IssuanceState) {
		const np = await this.identifierService.getNaturalPersonWalletByUsername(username);

		console.log("State = ", state)
		const httpHeader = { 
			"authorization": `Bearer ${state.tokenResponse.access_token}`,
		};

		const c_nonce = state.tokenResponse.c_nonce;
		const proof_jwt = await new SignJWT({ nonce: c_nonce })
			.setIssuedAt()
			.setExpirationTime('1m')
			.setProtectedHeader({ kid: np.key.did + "#" + np.key.did.split(':')[2], alg: 'ES256', typ: "openid4vci-proof+jwt" })
			.setIssuer(np.key.did)
			.setAudience(state.credentialIssuerMetadata.credential_issuer)
			.sign(await importJWK(np.key.privateKey, 'ES256'));



		const credentialEndpoint = state.credentialIssuerMetadata.credential_endpoint;

		let httpResponsePromises = state.authorization_details.map((authzDetail) => {
			const httpBody = {
				proof: {
					proof_type: "jwt",
					jwt: proof_jwt
				},
				...authzDetail
			}
			return axios.post(credentialEndpoint, httpBody, { headers: httpHeader });
		})
		
		const responses = await Promise.allSettled(httpResponsePromises);
		let credentialResponses = responses
			.filter(res => res.status == 'fulfilled')
			.map((res) => 
				res.status == "fulfilled" ? res.value.data as CredentialResponseSchemaType : null
			);


		for (const cr of credentialResponses) {
			this.checkConstantlyForPendingCredential(state, cr.acceptance_token);
		}
		
		// remove the ones that are for deferred endpoint
		credentialResponses = credentialResponses.filter((cres) => !cres.acceptance_token);

		for (const response of credentialResponses) {
			console.log("Response = ", response)
			this.handleCredentialStorage(username, response);
		}
		console.log("=====FINISHED OID4VCI")
		return;
	}

	// Deferred Credential only
	private async checkConstantlyForPendingCredential(state: IssuanceState, acceptance_token: string) {
		const defferedCredentialReqHeader = { 
			"authorization": `Bearer ${acceptance_token}`,
		};
		
		axios.post(state.credentialIssuerMetadata.deferred_credential_endpoint,
			{}, 
			{ headers: defferedCredentialReqHeader } )
			.then((res) => {
				console.log("deferredResponse = ", res.data);
				this.handleCredentialStorage(state.username, res.data);
			})
			.catch(err => {
				setTimeout(() => {
					this.checkConstantlyForPendingCredential(state, acceptance_token);
				}, 2000);
			})

		
	}

	private async handleCredentialStorage(username: string, credentialResponse: CredentialResponseSchemaType) {
		const userRes = await getUserByUsername(username);
		if (userRes.err) {
			return;
		}
		const user = userRes.unwrap();

		const { legalPerson } = this.states.get(username);
		console.log("Legal person  = ", legalPerson)
		const credentialPayload = JSON.parse(base64url.decode(credentialResponse.credential.split('.')[1]))
		const type = credentialPayload.vc.type as string[];
		const metadata = (await axios.get(legalPerson.url + "/.well-known/openid-credential-issuer")).data as CredentialIssuerMetadata;
		
		
		let logoUrl = config.url + "/alt-vc-logo.png";
		let background_color = "#D3D3D3";

		const supportedCredential = metadata.credentials_supported.filter(cs => cs.format == credentialResponse.format && _.isEqual(cs.types, type))[0];
		if (supportedCredential) {
			if (supportedCredential.display && 
					supportedCredential.display.length != 0 &&
					supportedCredential.display[0]?.logo &&
					supportedCredential.display[0]?.logo?.url) {
					
				logoUrl = supportedCredential.display[0].logo.url;

			}

			if (supportedCredential.display && supportedCredential.display.length != 0 && supportedCredential.display[0].background_color) {
				background_color = supportedCredential.display[0].background_color;
			}
		}


		createVerifiableCredential({
			issuerDID: credentialPayload.iss,
			credentialIdentifier: credentialPayload.jti,
			credential: credentialResponse.credential,
			holderDID: user.did,
			issuerURL: legalPerson.url,
			logoURL: logoUrl,
			format: credentialResponse.format as VerifiableCredentialFormat,
			backgroundColor: background_color,
			presentableFormat: [],
			issuanceDate: new Date(credentialPayload.iat * 1000),
			issuerFriendlyName: legalPerson.friendlyName
		}).then(success => { // when credential is stored, then send notification
			if (success.err) {
				return;
			}
			console.log("FCM token = ", user.fcmToken)
			sendPushNotification(user.fcmToken, "New Credential", "A new verifiable credential is in your wallet").catch(err => {
				console.log("Failed to send notification")
				console.log(err)
			});
		});

	}

	private static generatePresentableFormat(credentialSubjectMetadata: any, verifiableCredential: any): any {
		return getLeafNodesWithPath(verifiableCredential, credentialSubjectMetadata)
	}
}