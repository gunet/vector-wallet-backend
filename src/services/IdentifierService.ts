import { NaturalPersonWallet } from "@gunet/ssi-pack";
import { getUserByUsername } from "../entities/user.entity";
import { injectable } from "inversify";
import { IdentifierStore } from "./interfaces";
import "reflect-metadata";


@injectable()
export class IdentifierService implements IdentifierStore {
	public static readonly identifier = "IdentifierService"

	async getNaturalPersonWalletByUsername(username: string): Promise<NaturalPersonWallet> {
		const userResult = await getUserByUsername(username);
		if (userResult.err) {
			return;
		}

		const user = userResult.unwrap();
		const key = JSON.parse(user.keys);
		return await NaturalPersonWallet.initializeWallet(key);
	}
}