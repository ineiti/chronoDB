import { Tag } from "./blobs";
import { ChronoDB } from "./chronoDB";
import { Storage } from "./storage";

describe('testing storage and links', () => {
    async function compareCDB(cdb: ChronoDB) {
        await cdb.sync();
        const cdb2 = new ChronoDB(cdb.storage);
        await cdb2.load();
        expect([...cdb.blobs].map(([id, blob]) => [id, blob.data]))
            .toEqual([...cdb2.blobs].map(([id, blob]) => [id, blob.data]));
    }

    test('storing and loading a single blob', async () => {
        const mem = new Memory();

        const cdb1 = new ChronoDB(mem);
        const tag1 = Tag.create(cdb1, "test");
        expect(mem.lines).toHaveLength(0);
        cdb1.sync();
        expect(mem.lines).toHaveLength(1);
        await compareCDB(cdb1);

        const cdb2 = new ChronoDB(mem);
        await cdb2.load();
        const tag2 = cdb2.getBlobTag(tag1.id);
        expect(tag1).toEqual(tag2);
    });

    test('linking two tags with LinkBi', async () => {
        const cdb = new ChronoDB(new Memory());
        const tag1 = Tag.create(cdb, "test1");
        const tag2 = Tag.create(cdb, "test2");
        const link1 = tag1.createLinkBi(tag2);
        await compareCDB(cdb);

        expect(link1.getOne().link).toEqual(tag1.id);
        expect(link1.getTwo().link).toEqual(tag2.id);

        const link2 = tag1.createLinkBi(tag2);
        expect(link2).toEqual(link1);
    });

    test('linking two tags with LinkDirected', async () => {
        const cdb = new ChronoDB(new Memory());
        const tag1 = Tag.create(cdb, "test1");
        const tag2 = Tag.create(cdb, "test2");
        const link1 = tag1.createLinkDirected(tag2);
        await compareCDB(cdb);

        expect(link1.getFrom().link).toEqual(tag1.id);
        expect(link1.getTo().link).toEqual(tag2.id);

        const link2 = tag1.createLinkDirected(tag2);
        expect(link2).toEqual(link1);
    });

    test('linking two tags with mixed links', async () => {
        const cdb = new ChronoDB(new Memory());
        const tag1 = Tag.create(cdb, "test1");
        const tag2 = Tag.create(cdb, "test2");
        const link1 = tag1.createLinkDirected(tag2);
        const link2 = tag1.createLinkBi(tag2);
        expect(link1).not.toEqual(link2);
        await compareCDB(cdb);

        const link3 = tag1.createLinkDirected(tag2);
        expect(link3).toEqual(link1);
        const link4 = tag1.createLinkBi(tag2);
        expect(link4).toEqual(link2);
        expect(link3).not.toEqual(link4);
    });
});

class Memory implements Storage {
    lines: string[] = [];

    async load(): Promise<string[]> {
        return this.lines;
    }

    async add(line: string): Promise<void> {
        this.lines.push(line);
    }
}