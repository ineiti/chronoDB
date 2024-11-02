import { createPatch } from 'diff';
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

    async add(lines: string[]): Promise<void> {
        this.lines.push(...lines);
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
                        const prev = this.db.toString();
                        const other = new ReadTestDB(file).toString();
                        if (prev != other) {
                            console.log("Patch:\n", createPatch(file, prev, other));
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
                        if (file !== undefined) {
                            newFile = readFileSync(baseDir + file).toString();
                        }
                        this.file = await this.db.db.processFile(this.file, newFile);
                        await this.db.db.sync();
                        break;
                    case "compare":
                        const compare = readFileSync(baseDir + file).toString();
                        if (this.file !== compare) {
                            console.log("Patch:\n", createPatch(file, compare, this.file));
                            throw new Error(`Current file doesn't correspond to ${file}`);
                        }
                        break;
                    case "compare_light":
                        const compare_light = readFileSync(baseDir + file).toString();
                        const file_light = this.file.split("\n").filter((line) => !line.startsWith(">@"))
                            .map((line) => line.trim() === "" ? "" : line)
                            .join("\n");
                        if (file_light !== compare_light) {
                            console.log("Patch:\n", createPatch(file, compare_light, file_light));
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