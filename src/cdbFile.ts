import { Checkbox, ChronoBlob, ChronoBlobData, Tag } from "./blobs";
import { ChronoDB } from "./chronoDB";
import { BlobID, DBStorage, TimeData, TimeLink } from "./storage";

/**
 * CDBFiles are formatted like this:
 * 
 * 1..n '>' + CDBInstruction
 * empty line
 * 0..m ">@" + CDBBlobData + "\n"*
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
            } else {
                last.push(line);
            }
        }

        for (const block of blobLines) {
            if (block.length === 0) {
                continue;
            }
            this.blobs.push(CDBBlobData.fromLines(block, this.blobs));
        }
    }

    async process(cdb: ChronoDB, updated: CDBFile): Promise<string> {
        if (!this.cdbInstructions.every((instr, i) => instr.equals(updated.cdbInstructions[i]))) {
            this.cdbInstructions = updated.cdbInstructions;
            return this.updateFile(cdb);
        }

        for (const blob of this.blobs) {
            if (blob.id.length === 32) {
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

        for (const blob of updated.blobs) {
            if (blob.id?.length !== 32) {
                const newBlob = blob.create(cdb);
                for (const tag of [...tagsFollower, ...tagsAdd]) {
                    newBlob.createLinkDirected(tag);
                }
            }
        }

        return this.updateFile(cdb);
    }

    getBlob(id: BlobID): CDBBlobData | undefined {
        return this.blobs.filter((blob) => id.equals(blob.id)).first();
    }

    updateFile(cdb: ChronoDB): string {
        this.blobs = this.executeInstructions(cdb).map((blob) => CDBBlobData.fromChronoBlob(blob));
        return this.toString();
    }

    toString(): string {
        return [...this.cdbInstructions.map((inst) => inst.toString()),
            "",
        ...this.blobs.map((blob) => blob.toString())].join("\n");
    }

    getTags(cdb: ChronoDB): [ChronoBlob[], ChronoBlob[]] {
        const tagFollow: ChronoBlob[] = [];
        const tagAdd: ChronoBlob[] = [];
        for (const instr of this.cdbInstructions) {
            const [follow, add] = instr.getTags(cdb);
            tagFollow.push(...follow)
            tagAdd.push(...add)
        }
        return [tagFollow, tagAdd];
    }

    executeInstructions(cdb: ChronoDB): ChronoBlob[] {
        let blobs: ChronoBlob[] | undefined;
        for (const inst of this.cdbInstructions) {
            blobs = inst.getBlobs(cdb, blobs);
        }
        return blobs ?? [];
    }
}

type CDBInstrType = ("TagFollowers" | "Filter" | "TagAdd");

/**
 * Currently the following instructions are supported:
 * 
 * - TagFollowers
 *   #TAGNAME
 *  Edit all the followers of the tag with name TAGNAME.
 *  If no tag with name TAGNAME exists, it is created.
 *  If more than one tag exists with TAGNAME, 
 *  Displays all blobs which have a link TO that tag.
 *  If new blobs get added to this file, they will be linked TO that tag.
 *  If multiple TagSearch are given, the result of blobs linked TO ALL the tags are shown.
 * 
 * - Filter
 *   %PROPERTY [CONDITION]
 *  Only show blobs which have PROPERTY and optionally fulfill CONDITION.
 * 
 * - TagAdd
 *   +#TAGNAME
 *  If no tag with name TAGNAME exists, it will be created.
 *  All blobs in this file will be linked TO this tag.
 */
class CDBInstruction {
    cdbType: CDBInstrType;
    args: string[];

    constructor(line: string) {
        switch (line[0]) {
            case '#':
                this.cdbType = "TagFollowers";
                this.args = [line.slice(1)];
                return;
            case '%':
                this.cdbType = "Filter";
                this.args = line.split(" ", 2);
                return;
            case '+':
                if (line.startsWith("+#")) {
                    this.cdbType = "TagAdd";
                    this.args = [line.slice(2)];
                    return;
                }
        }
        throw new Error("Unknown instruction");
    }

    getBlobs(cdb: ChronoDB, current?: ChronoBlob[]): ChronoBlob[] {
        if (current === undefined) {
            if (this.cdbType !== "TagFollowers") {
                throw new Error("The first instruction needs to be 'TagFollowers'");
            }
            const [tags, _] = this.getTags(cdb);
            return tags.flatMap((tag) => tag.linksIncoming.map((link) => cdb.getBlobAny(link.link)));
        }
        switch (this.cdbType) {
            case "Filter":
                break;
            case "TagAdd":
                break;
            case "TagFollowers":
                break;
        }

        return [];
    }

    getTags(cdb: ChronoDB): [ChronoBlob[], ChronoBlob[]] {
        let tags = cdb.searchBlobString(this.args[0]).filter((cb) => cb.isBType("Tag"));
        if (tags.length === 0) {
            tags = [Tag.create(cdb, this.args[0])];
        }
        return [tags, []];
    }

    toString(): string {
        switch (this.cdbType) {
            case "TagFollowers":
                return `>#${this.args[0]}`;
            case "Filter":
                return `>%${this.args[0]}`;
            case "TagAdd":
                return `+#${this.args[0]}`;
        }
    }

    equals(other: CDBInstruction): boolean {
        return this.toString() === other.toString();
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
        return cdblob;
    }

    static fromLines(lines: string[], previous: ChronoBlobData[]) {
        const cdblob = new CDBBlobData();

        if (lines[0].startsWith(">@")) {
            cdblob.id = Buffer.from(lines.shift()!, "hex");
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
        const lines = [];
        const indent = "".padStart(this.indent);
        if (this.id.length === 32) {
            lines.push(`>@${this.id.toString('hex')}`);
        }
        switch (this.btype) {
            case "Tag":
                lines.push(this.data.data.toString());
                break;
            case "Checkbox":
                const cb = Checkbox.fromData(this.data.data);
                lines.push(`${indent}- [${cb[1] ? 'x' : ' '}] ${cb[0]}`);
                break;
            case "Text":
                lines.push(...this.data.data.toString().split("\n").map((l) => indent + l));
                break;
        }

        return lines.join("\n");
    }

    equals(other: CDBBlobData): boolean {
        if (this.id === undefined || this.id.length !== 32 || !this.id.equals(other.id)) {
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

    create(cdb: ChronoDB): ChronoBlob {
        return cdb.cacheAndApplyDBS(DBStorage.createNow(this.btype, this.data.data));
    }
}