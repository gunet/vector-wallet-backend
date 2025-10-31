import { injectable } from "inversify";
import { LegalPersonEntity, getAllLegalPersonsDIDs, getLegalPersonByDID } from "../entities/LegalPerson.entity";
import { LegalPersonsRegistry } from "./interfaces";
import "reflect-metadata";

@injectable()
export class LegalPersonService implements LegalPersonsRegistry {
	public static readonly identifier = "LegalPersonService"

	constructor() {
		setInterval(() => {
			// every day
			this.updateLegalPersonsFromTIR();
		}, 1000*86400)
	}

	private async updateLegalPersonsFromTIR() {
		const allLegalPersonDIDs = (await getAllLegalPersonsDIDs()).unwrap();
		// fetch all legal persons from TIR and check if some of them do not exist.
		// if they exist, then
	}

	public async getByIdentifier(did: string): Promise<LegalPersonEntity> {
		// search on the TIR registry and get the legal person
		return (await getLegalPersonByDID(did)).unwrap();
	}
}