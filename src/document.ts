import { TFile, Vault } from "obsidian";
import { ChronoDB } from "./chronoDB";

export class ChronoDBDocument {
    constructor(private db: ChronoDB, private vault: Vault) { }

    async updateFile(f: TFile){
        const lines = (await this.vault.read(f)).split("\n");
        const commands = lines.filter((line) => line.startsWith(">"));
        const content = lines.filter((line) => !line.startsWith(">"));
        await this.vault.modify(f, lines.join("\n"));
    }

    updateContent(commands: string[], content: string[]){}
}