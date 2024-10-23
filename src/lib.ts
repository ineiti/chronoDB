import { randomBytes } from "crypto";

export type BlobID = Buffer;

export function randomBlobID(): BlobID {
    return randomBytes(32);
}

export type Time = bigint;

// Created and Modified store the data of the blob in 'data'.
// Active stores the active beginning and end date in 'data'.
export type DBAction = ("Create" | "Delete" | "Modify" | "Active")

export type BlobType = ("LinkDirected" | "LinkBi" | "Tag" | "Checkbox" | "Text" | "URL" | "Version");

export class DBStorage {
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
            id: this.id.toString("hex"),
            data: this.data?.toString("hex"),
            bType: this.bType,
        })
    }

    static fromJSON(str: string): DBStorage {
        const obj = JSON.parse(str);
        const data = obj.data !== undefined ? Buffer.from(obj.data, "hex") : undefined;
        return new DBStorage(BigInt(obj.timestamp), obj.action, Buffer.from(obj.id, "hex"), data, obj.bType);
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

    constructor(public created: Time, public activeAt = [created, BigInt(0)]) {
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
    constructor(public link: BlobID, public dbTime = DBTime.now()) { }

    equals(o: TimeLink): boolean {
        return this.link.equals(o.link) && this.dbTime.equals(o.dbTime);
    }
}

export class TimeData {
    constructor(public data: Buffer, public dbTime = DBTime.now()) { }
}

// Start with storing the ID, too.
// Even though it might not be necessary.
export class ChronoBlob {
    id: BlobID;
    btype: BlobType;
    data: TimeData;
    linksOutgoing: TimeLink[] = [];
    linksIncoming: TimeLink[] = [];
    linksBi: TimeLink[] = [];
    deleted?: Time;

    static factory(cdb: ChronoDB, dbs: DBStorage): ChronoBlob {
        if (dbs.action !== "Create") {
            throw new Error("Can only use Create DBStorage lines");
        }
        switch (dbs.bType!) {
            case "LinkDirected":
                return new LinkDirected(cdb, dbs);
            case "LinkBi":
                return new LinkBi(cdb, dbs);
            case "Tag":
                return new Tag(cdb, dbs);
            case "Checkbox":
                return new Checkbox(cdb, dbs);
            case "Text":
                return new Text(cdb, dbs);
            case "URL":
                return new URL(cdb, dbs);
            case "Version":
                throw new Error("Not implemented");
        }
    }

    constructor(protected cdb: ChronoDB, dbs: DBStorage, dbt: BlobType) {
        if (dbs.action !== "Create") {
            throw new Error("Can only initialize with Create");
        }
        if (dbs.bType! !== dbt) {
            throw new Error("Got wrong type in DBStorage");
        }
        this.id = dbs.id;
        this.btype = dbs.bType!;
        this.data = new TimeData(dbs.data!, new DBTime(dbs.timestamp))
    }

    setActiveData(dbt: DBTime) {
        this.data.dbTime = dbt;
    }

    searchString(str: string): boolean {
        return this.data.data.toString().includes(str);
    }

    idStr(): string {
        return this.id.toString("hex");
    }

    hasLinkDirected(id: BlobID): boolean {
        return this.linksIncoming.some((tl) => tl.link.equals(id)) ||
            this.linksOutgoing.some((tl) => tl.link.equals(id));
    }

    hasLinkBi(id: BlobID): boolean {
        return this.linksBi.some((tl) => tl.link.equals(id));
    }

    isBType(bt: BlobType): boolean {
        return this.btype === bt;
    }

    getBtype(): BlobType {
        return this.btype;
    }

    addLinkDirected(to: ChronoBlob, link: LinkDirected) {
        this.linksOutgoing.push(link.getTo());
        to.linksIncoming.push(link.getFrom());
    }

    addLinkBi(to: ChronoBlob, link: LinkBi) {
        this.linksBi.push(link.getTwo());
        to.linksBi.push(link.getOne());
    }

    // Creates a directed link from one blob to another.
    // This is a directional link, and written to the "from" and "to" of the blobs.
    // It checks if the link already exists, and only adds a new one if it doesn't exist yet.
    createLinkDirected(to: ChronoBlob, active?: DBTime): LinkDirected {
        if (this.hasLinkDirected(to.id) && to.hasLinkDirected(this.id)) {
            const link = [...this.cdb.blobs].find(([_, blob]) => {
                if (blob.isBType("LinkDirected")) {
                    const link = blob as LinkDirected;
                    if (this.linksOutgoing.some((l) => l.equals(link.getTo()) &&
                        to.linksIncoming.some((l) => l.equals(link.getFrom())))) {
                        return link;
                    }
                }
            });
            if (link === undefined) {
                throw new Error("IDs exist, but are not part of a link");
            }
            return link[1] as LinkDirected;
        }
        const link = LinkDirected.create(this.cdb, this.id, to.id, active);
        this.linksOutgoing.push(link.getTo());
        to.linksIncoming.push(link.getFrom());
        return link;
    }

    // Sets a bidirectional link.
    // It checks if the link already exists, and only adds a new one, if it doesn't exist yet.
    createLinkBi(to: ChronoBlob, active?: DBTime): LinkBi {
        if (this.hasLinkBi(to.id) && to.hasLinkBi(this.id)) {
            const link = [...this.cdb.blobs].find(([_, blob]) => {
                if (blob.isBType("LinkBi")) {
                    const link = blob as LinkBi;
                    if (this.linksBi.some((l) => l.equals(link.getTwo()) &&
                        to.linksBi.some((l) => l.equals(link.getOne())))) {
                        return link;
                    }
                }
            });
            if (link === undefined) {
                throw new Error("IDs exist, but are not part of a link");
            }
            return link[1] as LinkBi;
        }
        const link = LinkBi.create(this.cdb, this.id, to.id, active);
        this.linksBi.push(link.getTwo());
        to.linksBi.push(link.getOne());
        return link;
    }

    addDBStorage(dbs: DBStorage) {
        switch (dbs.action) {
            case "Delete":
                this.data.dbTime.delete(dbs.timestamp, dbs.timestamp);
                break;
            case "Modify":
                if (dbs.data === undefined) {
                    throw new Error("Need data for Modify action");
                }
                this.data.data = dbs.data!;
                break;
            case "Active":
                if (dbs.data === undefined) {
                    throw new Error("Need data for Active action");
                }
                this.data.dbTime.setActiveFromData(dbs.timestamp, dbs.data!);
                break;
        }
    }
}

export interface Storage {
    load(): Promise<string[]>;
    add(line: string): Promise<void>;
}

export class ChronoDB {
    blobs = new Map<string, ChronoBlob>();
    cache: DBStorage[] = [];

    constructor(public storage: Storage) {
    }

    // Load the available data - will overwrite the current data!
    async load() {
        for (const line of await this.storage.load()) {
            this.applyDBS(DBStorage.fromJSON(line));
        }
    }

    // Syncs all the caches to the disk.
    async sync() {
        const cache = this.cache.splice(0);
        for (const dbs of cache) {
            await this.storage.add(dbs.toJSON());
        }
    }

    cacheAndApplyDBS(dbs: DBStorage): ChronoBlob {
        this.cache.push(dbs);
        return this.applyDBS(dbs);
    }

    applyDBS(dbs: DBStorage): ChronoBlob {
        if (dbs.action === "Create") {
            const blob = ChronoBlob.factory(this, dbs);
            this.blobs.set(blob.idStr(), blob);
            return blob;
        } else {
            const blob = this.blobs.get(dbs.id.toString("hex"));
            if (blob === undefined) {
                throw new Error("Got undefined ID in the DBStorage");
            }
            blob.addDBStorage(dbs);
            return blob;
        }
    }

    // Adds a blob to the internal storage.
    addBlob(b: ChronoBlob) {
        if (this.blobs.has(b.idStr())) {
            throw new Error("This blobID already exists");
        }
        this.blobs.set(b.idStr(), b);
    }

    getBlob<T extends ChronoBlob>(id: BlobID, bt: BlobType): T {
        const blob = this.blobs.get(id.toString("hex"));
        if (blob === undefined) {
            throw new Error("Unknown blob");
        }
        if (!blob.isBType(bt)) {
            throw new Error("Wrong type of blob");
        }
        return blob as T;
    }

    getBlobTag(id: BlobID): Tag {
        return this.getBlob(id, "Tag");
    }

    // Searches through all blobs for the given string, and returns
    // the blobs with that string.
    searchBlobString(str: string): ChronoBlob[] {

        return [];
    }
}

export class Tag extends ChronoBlob {
    static create(cdb: ChronoDB, tag: string): Tag {
        return cdb.cacheAndApplyDBS(DBStorage.createNow("Tag", Buffer.from(tag))) as Tag;
    }

    constructor(cdb: ChronoDB, dbs: DBStorage) {
        super(cdb, dbs, "Tag");
    }

    modifyData(nd: Buffer) {
        this.cdb.cache.push(DBStorage.modifyNow(this.id, nd));
        this.data.data = nd;
    }
}

export class Checkbox extends ChronoBlob {
    constructor(cdb: ChronoDB, dbs: DBStorage) {
        super(cdb, dbs, "Checkbox");
    }

    modifyData(nd: Buffer) {
        this.cdb.cache.push(DBStorage.modifyNow(this.id, nd));
        this.data.data = nd;
    }
}

export class Text extends ChronoBlob {
    constructor(cdb: ChronoDB, dbs: DBStorage) {
        super(cdb, dbs, "Text");
    }

    modifyData(nd: Buffer) {
        this.cdb.cache.push(DBStorage.modifyNow(this.id, nd));
        this.data.data = nd;
    }
}

export class URL extends ChronoBlob {
    constructor(cdb: ChronoDB, dbs: DBStorage) {
        super(cdb, dbs, "URL");
    }

    modifyData(nd: Buffer) {
        this.cdb.cache.push(DBStorage.modifyNow(this.id, nd));
        this.data.data = nd;
    }
}

export class LinkBi extends ChronoBlob {
    links: BlobID[];

    static create(cdb: ChronoDB, one: BlobID, two: BlobID, active?: DBTime): LinkBi {
        const data = Buffer.alloc(64);
        one.copy(data);
        two.copy(data, 32);
        const link = cdb.cacheAndApplyDBS(DBStorage.createNow("LinkBi", data));

        if (active !== undefined) {
            cdb.cacheAndApplyDBS(DBStorage.activeNow(link.id, active));
        }
        return link as LinkBi;
    }

    constructor(cdb: ChronoDB, dbs: DBStorage) {
        super(cdb, dbs, "LinkBi");
        this.links = [Buffer.alloc(32), Buffer.alloc(32)];
        this.data.data.copy(this.links[0], 0, 0, 32);
        this.data.data.copy(this.links[1], 0, 32, 128);

        const [one, two] = [this.cdb.blobs.get(this.getOne().link.toString("hex")),
        this.cdb.blobs.get(this.getTwo().link.toString("hex"))];
        if (one === undefined || two === undefined) {
            throw new Error("Didn't find ChronoBlobs for LinkBi");
        }
        one.addLinkBi(two, this);
    }

    getOne(): TimeLink {
        return new TimeLink(this.links[0], this.data.dbTime);
    }

    getTwo(): TimeLink {
        return new TimeLink(this.links[1], this.data.dbTime);
    }
}

export class LinkDirected extends ChronoBlob {
    from: BlobID;
    to: BlobID;

    static create(cdb: ChronoDB, from: BlobID, to: BlobID, active?: DBTime): LinkDirected {
        const data = Buffer.alloc(64);
        from.copy(data);
        to.copy(data, 32);

        const link = cdb.cacheAndApplyDBS(DBStorage.createNow("LinkDirected", data));

        if (active !== undefined) {
            cdb.cacheAndApplyDBS(DBStorage.activeNow(link.id, active));
        }
        return link as LinkDirected;
    }

    constructor(cdb: ChronoDB, dbs: DBStorage) {
        super(cdb, dbs, "LinkDirected");
        this.from = Buffer.alloc(32);
        this.to = Buffer.alloc(32);
        this.data.data.copy(this.from, 0, 0, 32);
        this.data.data.copy(this.to, 0, 32, 64);

        const [from, to] = [cdb.blobs.get(this.getFrom().link.toString("hex")),
        this.cdb.blobs.get(this.getTo().link.toString("hex"))];
        if (from === undefined || to === undefined) {
            throw new Error("Didn't find ChronoBlobs for LinkDirected");
        }
        from.addLinkDirected(to, this);
    }

    getFrom(): TimeLink {
        return new TimeLink(this.from, this.data.dbTime);
    }

    getTo(): TimeLink {
        return new TimeLink(this.to, this.data.dbTime);
    }
}
