import { BlobID, BlobType, DBStorage, Storage } from "./storage";
import { ChronoBlob, Tag } from "./blobs";
import { CDBFile } from "./cdbFile";
import { randomBytes } from "crypto";

export class ChronoDB {
    blobs = new Map<string, ChronoBlob>();
    cache: DBStorage[] = [];
    idLen = 32;

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
        await this.storage.add(cache.map((dbs) => dbs.toJSON()));
    }

    blobsAsArray(): string[] {
        return [...this.blobs.entries()].map(([k, v]) => k + v.toJSON());
    }

    equals(other: ChronoDB): boolean {
        return this.blobsAsArray().toString() === other.blobsAsArray().toString();
    }

    cacheAndApplyDBS(dbs: DBStorage): ChronoBlob {
        this.cache.push(dbs);
        return this.applyDBS(dbs);
    }

    randomID(): BlobID {
        return randomBytes(this.idLen);
    }    

    // Adds a blob to the internal storage.
    addBlob(b: ChronoBlob) {
        if (this.blobs.has(b.idStr())) {
            throw new Error("This blobID already exists");
        }
        this.blobs.set(b.idStr(), b);
    }

    getBlobAny(id: BlobID): ChronoBlob {
        const blob = this.blobs.get(id.toString("hex"));
        if (blob === undefined) {
            throw new Error("Unknown blob");
        }
        return blob;
    }

    getBlob<T extends ChronoBlob>(id: BlobID, bt: BlobType): T {
        const blob = this.getBlobAny(id);
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
        return [...this.blobs.values()].filter((blob) => blob.searchString(str));
    }

    /**
     * Processes the difference between the savedFile and the
     * editFile and returns the newFile.
     * 
     * If the CDB-part between the saved and the edit changes, then
     * the rest of the file is ignored, and the returned string is
     * the newFile with the search results updated.
     * 
     * If the CDB-part between the saved and the edit is the same,
     * then the rest of the file is scanned to see whether there are
     * modifications: edits, additions, deletions, re-arrangements.
     * For these modifications, new DBStorages are emitted.
     * Finally an updated version of the file is returned.
     * 
     * If the editFile contains an error, the returned string
     * is the editFile, but with an indication of where the error
     * happened.
     * This is independant of the state of the savedFile.
     * 
     * If the editFile is correct, but the savedFile contains an error,
     * then the savedFile is discarded, and the
     * editFile is used to interpret the CDB-part.
     * The newFile will contain the CDB-part and the search result of it.
     * 
     * @param savedFile
     * @param editFile 
     */
    async processFile(savedFile: string, editFile: string): Promise<string> {
        return new CDBFile(savedFile).process(this, new CDBFile(editFile));
    }

    private applyDBS(dbs: DBStorage): ChronoBlob {
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
}
