import { ChronoDB } from '../src/chronoDB';
import { Storage } from '../src/storage';
import { readFileSync } from 'fs';


export class ReadTestDB implements Storage {
    lines: string[] = [];
    db: ChronoDB;

    constructor(name: string) {
        this.lines = readFileSync(name).toString().split("\n");
        this.db = new ChronoDB(this);
    }

    async equals(other: ReadTestDB) {
        return this.lines.toString() === other.lines.toString();
    }

    async getDb(): Promise<ChronoDB> {
        await this.db.load();
        return this.db;
    }

    async load(): Promise<string[]> {
        return this.lines;
    }

    async save(lines: string[]): Promise<void> {
        this.lines = lines;
    }
}