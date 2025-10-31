import { NaturalPersonWallet } from "@gunet/ssi-pack";
import { LegalPersonEntity } from "../entities/LegalPerson.entity";

export interface CredentialReceiving {
	
	getAvailableSupportedCredentials(username: string, legalPersonDID: string): Promise<Array<{id: string, displayName: string}>>
	generateAuthorizationRequestURL(username: string, credentialOfferURL?: string, legalPersonDID?: string): Promise<{ redirect_to: string }> 
	handleAuthorizationResponse(username: string, authorizationResponseURL: string): Promise<void>;
	requestCredentialsWithPreAuthorizedGrant(username: string, user_pin: string);

	getIssuerState(username: string): Promise<{ issuer_state?: string, error?: Error; }>
}

export interface IdentifierStore {
	getNaturalPersonWalletByUsername(username: string): Promise<NaturalPersonWallet>;
}

export interface PresentationSending {
	
	parseIdTokenRequest(did: string, username: string, authorizationRequestURL: string): Promise<{ redirect_to: string }>;
	parseAuthorizationRequest(did: string, username: string, authorizationRequestURL: string): Promise<{conformantCredentialsMap: Map<string, string[]>, verifierDomainName: string}>;
	generateAuthorizationResponse(did: string, username: string, verifiable_credentials_map: any): Promise<{ redirect_to: string }>;

}


export interface LegalPersonsRegistry {
	getByIdentifier(did: string): Promise<LegalPersonEntity>;
}