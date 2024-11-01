import { ChronoDB } from '../src/chronoDB';
import { Storage } from '../src/storage';
import { readFileSync } from 'fs';

const baseDir = "tests/files/";

export class ReadTestDB implements Storage {
    lines: string[] = [];
    db: ChronoDB;

    constructor(name: string) {
        this.lines = readFileSync(baseDir + name).toString().split("\n");
        this.db = new ChronoDB(this);
    }

    toString(): string {
        return this.lines.join("\n");
    }

    equals(other: ReadTestDB): boolean {
        return this.toString() === other.toString();
    }

    async dbEquals(other: ReadTestDB): Promise<boolean> {
        await this.db.sync();
        await other.db.sync();
        return this.equals(other);
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

export class ReadTestLog {
    lines: string[] = [];
    file: string = "";
    db: ReadTestDB;

    constructor(name: string) {
        this.lines = readFileSync(baseDir + name).toString().split("\n");
    };

    async executeLine(line: string) {
        const [element, command, file] = line.split(":");
        switch (element) {
            case "db":
                switch (command) {
                    case "read":
                        this.db = new ReadTestDB(file);
                        break;
                    case "compare":
                        const ok = await this.db.dbEquals(new ReadTestDB(file));
                        if (!ok) {
                            throw new Error(`Comparison of DB failed with line ${line}`);
                        }
                        break;
                }
                break;
            case "blobs":
                switch (command) {
                    case "compare":
                        throw new Error("Not yet implemented");
                }
                break;
            case "file":
                switch (command) {
                    case "read":
                        this.file = readFileSync(baseDir + file).toString();
                        break;
                    case "process":
                        let newFile = this.file;
                        if (file !== undefined){
                            newFile = readFileSync(baseDir + file).toString();
                        }
                        this.file = await this.db.db.processFile(this.file, newFile);
                        await this.db.db.sync();
                        break;
                    case "compare":
                        const compare = readFileSync(baseDir + file).toString();
                        if (this.file !== compare) {
                            console.log(`Old file:\n${this.file}`);
                            console.log(`\nCompare with:\n${compare}`);
                            throw new Error(`Current file doesn't correspond to ${file}`);
                        }
                        break;
                }
                break;
        }
    }

    async execute() {
        for (const line of this.lines) {
            console.log(`Executing: ${line}`);
            await this.executeLine(line);
        }
    }
}