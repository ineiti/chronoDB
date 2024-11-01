# ChronoDB

A plugin for Obsidian to store elements in a chronological database.
Every file is a view into the database with the elements directly editable in the file.
Interact with the database using tags, links, date ranges, search criterias, and more.

## Simple Example

For a TODO list where the elements go directly into a DONE list when clicked, you can
create the following file:

### File TODO.md
```md
>#TODO
>%checked == false

- [ ] My first task
  - [ ] A sub-task
  - [ ] Another sub-task
```

This will create four elements: the tag `TODO`, and the three elements for the TODO list.
Internally, these elements are linked: all tasks are linked to `TODO`, while the two
sub-tasks are also linked to `My first task`.
Now you can add a second view:

### File DONE.md
```md
>#TODO
>%checked == true
```

This file starts out empty.
But once you click on one of the tasks in the `TODO.md` file and save it,
you can update the `DONE.md` file, and the task will show up.

### Additional Configurations

If you change `DONE.md` to the example below, and click on one of the sub-tasks,
it will appear checked, but its parent will also appear, but unchecked:

```md
>#TODO
>%checked == true
>!parent

- [ ] My first task
  - [x] A sub-task
```

This is because ChronoDB applies the commands starting with `>` in order:

- `>#TODO` - search all blobs linked to the `#TODO` tag
- `>%checked == true` - but only show blobs which have the property `checked`, and where it is `true`
- `>!parent` - for all found blobs, also show their first parent which is not part of the search blobs

# Versions

2024-10-20 - start