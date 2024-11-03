import { Checkbox, ChronoBlob, ChronoBlobData, Tag, Text } from "./blobs";
import { ChronoDB } from "./chronoDB";
import { BlobID, DBStorage, TimeData, TimeLink } from "./storage";

/**
 * CDBFiles are formatted like this:
 * 
 * 1..n '>' + CDBInstruction
 * empty line
 * 0..m ">@hex_encoded_id\n"? + CDBBlobData + "\n"*
 */

export class CDBFile {
    cdbInstructions: CDBInstruction[] = [];
    blobs: CDBBlobData[] = [];

    constructor(file: string) {
        const lines = file.split("\n");
        let line: string | undefined;
        while ((line = lines.shift()) && line?.startsWith('>')) {
            this.cdbInstructions.push(new CDBInstruction(line.slice(1)));
        }

        const blobLines: string[][] = [[]];
        for (const line of lines) {
            const last = blobLines[blobLines.length - 1];
            if (line.length === 0) {
                if (last.length > 0) {
                    blobLines.push([]);
                }
                continue;
            }

            if (line.startsWith(">@")) {
                blobLines.push([line]);
            } else if (line.match(/ *- \[[x ]\]/) &&
                !(last.length === 1 && last[0].startsWith(">@"))) {
                blobLines.push([line]);
            } else {
                last.push(line);
            }
        }

        for (const block of blobLines.filter((block) => block.length > 0)) {
            this.blobs.push(CDBBlobData.fromLines(block, this.blobs));
        }
    }

    async process(cdb: ChronoDB, updated: CDBFile): Promise<string> {
        if (this.cdbInstructions.length !== updated.cdbInstructions.length ||
            !this.cdbInstructions.every((instr, i) => instr.equals(updated.cdbInstructions[i]))) {
            this.cdbInstructions = updated.cdbInstructions;
            return this.updateFile(cdb);
        }

        for (const blob of this.blobs) {
            if (blob.id.length === cdb.idLen) {
                const blob2 = updated.getBlob(blob.id);
                if (blob2 === undefined) {
                    cdb.getBlobAny(blob.id).delete();
                } else {
                    if (blob.equals(blob2)) {
                        continue;
                    }
                }
            } else {
                throw new Error("Found invalid blob-ID in saved file");
            }
        }

        const [tagsFollower, tagsAdd] = this.getTags(cdb);

        let parents = [updated.blobs[0]];
        for (const cdBlob of updated.blobs) {
            let last = parents[parents.length - 1];
            while (cdBlob.indent <= last.indent && parents.length > 1) {
                parents.pop();
                last = parents[parents.length - 1];
            }
            const blob = cdBlob.getBlobOrCreate(cdb);
            for (const tag of [...tagsFollower, ...tagsAdd]) {
                blob.createLinkDirected(tag);
            }
            if (last.indent < cdBlob.indent) {
                blob.createLinkDirected(cdb.getBlobAny(last.id));
            }

            if (!cdBlob.data.data.equals(blob.data.data)) {
                blob.modifyData(cdBlob.data.data);
            }

            if (cdBlob.indent > last.indent) {
                parents.push(cdBlob);
            }
        }

        return this.updateFile(cdb);
    }

    getBlob(id: BlobID): CDBBlobData | undefined {
        return this.blobs.filter((blob) => blob.idValid() && blob.id.equals(id))[0];
    }

    updateFile(cdb: ChronoDB): string {
        this.blobs = this.executeInstructions(cdb).map((blob) => CDBBlobData.fromChronoBlob(blob));
        CDBBlobData.indentBlobs(this.blobs);
        return this.toString();
    }

    toString(): string {
        return [...this.cdbInstructions.map((inst) => inst.toString()),
            "",
        ...this.blobs.map((blob) => blob.toString())].join("\n");
    }

    getTags(cdb: ChronoDB): [ChronoBlob[], ChronoBlob[]] {
        const followers: ChronoBlob[] = [];
        const newParent: ChronoBlob[] = [];
        for (const instr of this.cdbInstructions) {
            switch (instr.cdbType) {
                case "Followers":
                    followers.push(...instr.getBlobs(cdb));
                    break;
                case "NewParent":
                    newParent.push(...instr.getBlobs(cdb));
                    break;
            }
        }
        return [followers, newParent];
    }

    executeInstructions(cdb: ChronoDB): ChronoBlob[] {
        let blobs: ChronoBlob[] | undefined;
        for (const inst of this.cdbInstructions) {
            blobs = inst.getResultBlobs(cdb, blobs, this.getTags(cdb).flat());
        }
        return blobs ?? [];
    }
}

type CDBInstrType = ("Followers" | "Filter" | "NewParent" | "Command");

/**
 * Currently the following instructions are supported:
 * 
 * - Followers
 *   &BLOBNAME
 *  Edit all the followers of the blobs containing BLOBNAME.
 *  If no blob contains BLOBNAME, it is created.
 *  If more than one blob exists containing BLOBNAME, they are all considered.
 *  Displays all blobs which have a link TO at least one of these blobs.
 *  If new blobs get added to this file, they will be linked TO all blobs containing BLOBNAME.
 *  If multiple Followers are given, the result of blobs linked TO ALL the BLOBNAME blobs are shown.
 *  You can restrict the BLOBNAME to tags by starting with a `#`.
 *  You can restrict the BLOBNAME to IDs by starting with a `$`, in this case BLOBNAME must be a hex string.
 * 
 * - Filter
 *   %PROPERTY [CONDITION]
 *  Only show blobs which have PROPERTY and optionally fulfill CONDITION.
 * 
 * - NewParent
 *   +BLOBNAME
 *  If no blob contains BLOBNAME exists, one will be created.
 *  All blobs in this file will be linked TO these blobs.
 *  Starting the BLOBNAME with a `#` will only search for tags.
 *  Starting the BLOBNAME with a `$` will search for a blob with the ID of BLOBNAME in hexadecimal.
 */
class CDBInstruction {
    cdbType: CDBInstrType;
    args: string[];

    constructor(line: string) {
        switch (line[0]) {
            case '&':
                this.cdbType = "Followers";
                this.args = [line.slice(1)];
                return;
            case '%':
                this.cdbType = "Filter";
                this.args = line.slice(1).split(" ").filter((arg) => arg.length > 0);
                return;
            case '+':
                this.cdbType = "NewParent";
                this.args = [line.slice(1)];
                return;
            case '!':
                this.cdbType = "Command";
                this.args = line.slice(1).split(" ").filter((arg) => arg.length > 0);
                return;
        }
        throw new Error(`Unknown instruction in line: ${line}`);
    }

    getResultBlobs(cdb: ChronoDB, current?: ChronoBlob[], cmdBlobs: ChronoBlob[] = []): ChronoBlob[] {
        if (current === undefined) {
            if (this.cdbType !== "Followers") {
                throw new Error("The first instruction needs to be 'Followers'");
            }
            const tags = this.getBlobs(cdb);
            return tags
                .flatMap((tag) => tag.linksIncoming.map((link) => cdb.getBlobAny(link.link)))
                .filter((blob) => blob.deleted === undefined);
        }
        switch (this.cdbType) {
            case "Filter":
                return current.filter((blob) => blob.filter(this.args));
            case "NewParent":
                throw new Error("Not implemented");
            case "Followers":
                throw new Error("Not implemented");
            case "Command":
                return this.execCommand(cdb, current, cmdBlobs);
        }
    }

    getBlobs(cdb: ChronoDB): ChronoBlob[] {
        let search = this.args[0];
        let filter = "";
        if ("#$".includes(search[0])) {
            filter = search[0];
            search = search.substring(1);
        }
        let blobs = cdb.searchBlobString(search)
        switch (filter) {
            case "#":
                if (blobs.length === 0) {
                    blobs = [Tag.create(cdb, search)];
                } else {
                    blobs = blobs.filter((cb) => cb.isBType("Tag"));
                }
                break;
            case "$":
                blobs = [cdb.getBlobAny(Buffer.from(search, "hex"))];
                break;
            default:
                if (blobs.length === 0) {
                    blobs = [Text.create(cdb, search)];
                }
        }
        return blobs.filter((blob) => blob.deleted === undefined);
    }

    toString(): string {
        switch (this.cdbType) {
            case "Followers":
                return `>&${this.args[0]}`;
            case "Filter":
                return `>%${this.args.join(" ")}`;
            case "NewParent":
                return `>+${this.args[0]}`;
            case "Command":
                return `>!${this.args.join(" ")}`;
        }
    }

    equals(other: CDBInstruction): boolean {
        return this.toString() === other.toString();
    }

    execCommand(cdb: ChronoDB, current: ChronoBlob[], cmdBlobs: ChronoBlob[]): ChronoBlob[] {
        switch (this.args[0]) {
            case "parent":
                for (let i = 0; i < current.length; i++) {
                    for (const link of current[i].linksOutgoing) {
                        if (!current.concat(cmdBlobs).some((b) => b.id.equals(link.link))) {
                            // Only insert the first link found as parent
                            current.splice(i, 0, cdb.getBlobAny(link.link));
                            i++;
                            // break;
                        }
                    }
                }
                break;
        }
        return current;
    }
}

class CDBBlobData extends ChronoBlobData {
    indent: number;

    static equalLinks(a: TimeLink[], b: TimeLink[]): boolean {
        if (a.length !== b.length) {
            return false;
        }

        return !a.every((l, i) => l.equals(b[i]));
    }

    static fromChronoBlob(blob: ChronoBlob): CDBBlobData {
        const cdblob = new CDBBlobData();
        cdblob.id = blob.id;
        cdblob.data = blob.data;
        cdblob.btype = blob.btype;
        cdblob.linksOutgoing = blob.linksOutgoing;
        cdblob.indent = 0;
        return cdblob;
    }

    static indentBlobs(blobs: CDBBlobData[]) {
        if (blobs.length === 0) {
            return;
        }
        blobs[0].indent = 0;
        for (let i = 1; i < blobs.length; i++) {
            for (const link of blobs[i].linksOutgoing) {
                const index = blobs.findIndex((blob) => link.link.equals(blob.id));
                if (index >= 0 && index < i) {
                    blobs[i].indent = blobs[index].indent + 2;
                    break;
                }
            }
        }
    }

    static fromLines(lines: string[], previous: ChronoBlobData[]) {
        const cdblob = new CDBBlobData();

        if (lines[0].startsWith(">@")) {
            cdblob.id = Buffer.from(lines.shift()!.slice(2), "hex");
        }
        cdblob.indent = lines[0].length - lines[0].trimStart().length;
        const blob = lines[0].slice(cdblob.indent);
        let more = lines.slice(1).map((l) => l.slice(cdblob.indent)).join("\n");
        if (more === undefined) {
            more = "";
        } else {
            more = "\n" + more;
        }
        if (blob.startsWith("#")) {
            // Tag
            cdblob.btype = "Tag";
            cdblob.data = new TimeData(Buffer.from(blob.slice(1)));
            if (lines.length > 1) {
                throw new Error("Can only handle tags on one line");
            }
        } else if (blob.startsWith("- [")) {
            // Checkbox
            cdblob.btype = "Checkbox";
            cdblob.data = new TimeData(Checkbox.toData(blob.slice(5).trimStart() + more,
                blob[3].toLocaleLowerCase() === "x"))
        } else {
            // Text
            cdblob.btype = "Text";
            cdblob.data = new TimeData(Buffer.from(blob + more));
        }

        return cdblob;
    }

    toString(): string {
        let lines = [];
        const indent = "".padStart(this.indent);
        switch (this.btype) {
            case "Tag":
                lines.push(this.data.data.toString());
                break;
            case "Checkbox":
                const cb = Checkbox.fromData(this.data.data);
                const cbLines = cb[0].split("\n");
                lines.push(`- [${cb[1] ? 'x' : ' '}] ${cbLines.shift()}`);
                lines.push(...cbLines);
                break;
            case "Text":
                lines.push(...this.data.data.toString().split("\n"));
                break;
        }

        lines = lines.map((line) => indent + line);
        if (this.idValid()) {
            lines.unshift(`>@${this.id.toString('hex')}`);
        }
        return lines.join("\n");
    }

    equals(other: CDBBlobData): boolean {
        if (this.idValid() || !this.id.equals(other.id)) {
            return false;
        }
        if (this.btype !== other.btype || !this.data.data.equals(other.data.data)) {
            return false;
        }
        if (!CDBBlobData.equalLinks(this.linksBi, other.linksBi) ||
            !CDBBlobData.equalLinks(this.linksIncoming, other.linksIncoming) ||
            !CDBBlobData.equalLinks(this.linksOutgoing, other.linksOutgoing)) {
            return false;
        }

        return true;
    }

    getBlobOrCreate(cdb: ChronoDB): ChronoBlob {
        if (this.idValid()) {
            return cdb.getBlobAny(this.id);
        }
        return this.create(cdb);
    }

    create(cdb: ChronoDB): ChronoBlob {
        const blob = cdb.cacheAndApplyDBS(DBStorage.createNow(cdb.randomID(), this.btype, this.data.data));
        this.overwrite(blob);
        return blob;
    }

    idValid(): boolean {
        return this.id !== undefined && this.id.length > 0;
    }
}