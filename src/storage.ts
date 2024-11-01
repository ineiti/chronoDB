import { randomBytes } from "crypto";

export type BlobID = Buffer;

export function randomBlobID(): BlobID {
    return randomBytes(32);
}

export type Time = bigint;

export function TimeNow(): Time {
    return BigInt(new Date().getTime());
}

// Created and Modified store the data of the blob in 'data'.
// Active stores the active beginning and end date in 'data'.
export type DBAction = ("Create" | "Delete" | "Modify" | "Active")

export type BlobType = ("LinkDirected" | "LinkBi" | "Tag" | "Checkbox" | "Text" | "URL" | "Version");

export class DBStorage {
    static fromJSON(str: string): DBStorage {
        const obj = JSON.parse(str);
        const data = obj.data !== undefined ? Buffer.from(obj.data, "base64") : undefined;
        return new DBStorage(BigInt(obj.timestamp), obj.action, Buffer.from(obj.id, "base64"), data, obj.bType);
    }

    static create(timestamp: Time, bType: BlobType, data: Buffer): DBStorage {
        return new DBStorage(timestamp, "Create", randomBlobID(), data, bType);
    }

    static createNow(bType: BlobType, data: Buffer): DBStorage {
        return DBStorage.create(BigInt(Date.now()), bType, data);
    }

    static delete(timestamp: Time, id: BlobID): DBStorage {
        return new DBStorage(timestamp, "Delete", id);
    }

    static deleteNow(id: BlobID): DBStorage {
        return DBStorage.delete(BigInt(Date.now()), id);
    }

    static modify(timestamp: Time, id: BlobID, data: Buffer): DBStorage {
        return new DBStorage(timestamp, "Modify", id, data);
    }

    static modifyNow(id: BlobID, data: Buffer): DBStorage {
        return DBStorage.modify(BigInt(Date.now()), id, data);
    }

    static active(timestamp: Time, id: BlobID, from: bigint, to: bigint): DBStorage {
        const data = Buffer.alloc(16);
        data.writeBigUInt64LE(from);
        data.writeBigUInt64LE(to, 8);

        return new DBStorage(timestamp, "Active", id, data);
    }

    static activeNow(id: BlobID, dbt: DBTime): DBStorage {
        return DBStorage.active(dbt.created, id, dbt.activeAt[0], dbt.activeAt[1]);
    }

    constructor(
        public timestamp: Time,
        public action: DBAction,
        public id: BlobID,
        // data is only valid for action == ("Created" | "Modified" | "Active") and ignored otherwise.
        public data?: Buffer,
        // bType is only valid with action == "Created" and ignored otherwise.
        public bType?: BlobType
    ) { }

    toJSON(): string {
        return JSON.stringify({
            timestamp: this.timestamp.toString(),
            action: this.action,
            id: this.id.toString("base64"),
            data: this.data?.toString("base64"),
            bType: this.bType,
        })
    }
}

export class DBTime {
    modified: Time[] = [];

    static dataToArray(data: Buffer): [Time, Time] {
        return [data.readBigUInt64LE(0), data.readBigUInt64LE(8)];
    }

    static fromData(data: Buffer, created = BigInt(Date.now())): DBTime {
        return new DBTime(created, DBTime.dataToArray(data));
    }

    static now(activeAt?: [Time, Time]): DBTime {
        return new DBTime(BigInt(Date.now()), activeAt);
    }

    static fromJSON(val: string): DBTime {
        const s = JSON.parse(val);
        if (Object.keys(s).toString() !== 'created,activeAt,modified') {
            throw new Error("Didn't find correct fields")
        }
        const dbt = new DBTime(BigInt(s.created), [BigInt(s.activeAt[0]), BigInt(s.activeAt[1])]);
        dbt.modified = s.modified.map((t: string) => BigInt(t));
        return dbt;
    }

    constructor(public created: Time, public activeAt = [created, BigInt(0)]) {
    }

    toJSON(): string {
        return JSON.stringify({
            created: this.created,
            activeAt: this.activeAt,
            modified: this.modified,
        })
    }

    equals(o: DBTime): boolean {
        return this.modified === o.modified &&
            this.created === o.created &&
            this.activeAt === o.activeAt;
    }

    deleted(): boolean {
        return this.activeAt[0] === BigInt(0) && this.activeAt[1] === BigInt(0);
    }

    addModify(t: Time) {
        if (this.deleted()) {
            throw new Error("Cannot modify a deleted blob");
        }
        this.modified.push(t);
    }

    delete(cur: Time, t: Time) {
        this.addModify(t);
        this.setActive(cur, [BigInt(0), BigInt(0)]);
    }

    setActive(cur: Time, t: [Time, Time]) {
        this.addModify(cur);
        this.activeAt = t;
    }

    setActiveFromData(cur: Time, d: Buffer) {
        this.addModify(cur);
        this.activeAt = DBTime.dataToArray(d);
    }
}

export class TimeLink {
    static fromJSON(val: string): TimeLink {
        const s = JSON.parse(val);
        if (Object.keys(s).toString() !== 'link,dbTime') {
            throw new Error("Didn't find correct fields")
        }
        return new TimeLink(Buffer.from(s.link, "base64"), DBTime.fromJSON(s.dbTime));
    }

    constructor(public link: BlobID, public dbTime = DBTime.now()) { }

    toJSON(): string {
        return JSON.stringify({
            link: this.link.toString("base64"),
            dbTime: this.dbTime.toJSON(),
        })
    }

    equals(o: TimeLink): boolean {
        return this.link.equals(o.link) && this.dbTime.equals(o.dbTime);
    }
}

export class TimeData {
    static fromJSON(val: string): TimeData {
        const s = JSON.parse(val);
        if (Object.keys(s).toString() !== 'data,dbTime') {
            throw new Error("Didn't find correct fields")
        }
        return new TimeData(Buffer.from(s.data, "base64"), DBTime.fromJSON(s.dbTime));
    }

    constructor(public data: Buffer, public dbTime = DBTime.now()) { }

    toJSON(): string {
        return JSON.stringify({
            data: this.data.toString("base64"),
            dbTime: this.dbTime.toJSON(),
        })
    }

}

export interface Storage {
    load(): Promise<string[]>;
    save(lines: string[]): Promise<void>;
}

export class Memory implements Storage {
    lines: string[] = [];

    async load(): Promise<string[]> {
        return this.lines;
    }

    async save(lines: string[]): Promise<void> {
        this.lines = lines;
    }
}