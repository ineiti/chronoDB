// Start with storing the ID, too.

import { ChronoDB } from "./chronoDB";
import { BlobID, BlobType, DBStorage, DBTime, Time, TimeData, TimeLink } from "./storage";

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
