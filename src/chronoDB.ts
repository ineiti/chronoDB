import { BlobID, BlobType, DBStorage, Storage } from "./storage";
import { ChronoBlob, Tag } from "./blobs";

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
        this.storage.save(cache.map((dbs) => dbs.toJSON()));
    }

    blobsAsArray(): string[]{
        return [...this.blobs.entries()].map(([k,v]) => k + v.toJSON());
    }

    equals(other: ChronoDB): boolean {
        return this.blobsAsArray().toString() === other.blobsAsArray().toString();
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
