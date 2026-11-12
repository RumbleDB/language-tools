# JSONiq and XQuery Language Support

Write and run JSONiq and XQuery in VS Code, with [RumbleDB](https://rumbledb.org/) checking your queries and executing them. The extension handles `.jq`, `.jsoniq`, `.jqm`, `.xq`, `.xqy`, `.xquery` and `.xqm` files.

Running queries and type checking need Java 17 or newer. See [Requirements](#requirements).

![A JSONiq query with its results shown as a table and as an expandable list](https://github.com/user-attachments/assets/dd9657ae-3b08-494f-8dd6-110ac1778e3b)

## Features

- **Completion** for keywords, functions, variables, types, object fields, path steps and file paths
- **Type checking** and syntax errors as you type
- **Inferred types** and function documentation on hover
- **Go to definition**, find references and rename
- **Run queries** and browse the results as a list or a table
- **Outline view**, and clickable links on module and schema imports
- **Document formatting**
- **Signature help** and inlay hints for function calls
- **Semantic highlighting** on top of the TextMate grammars
- **Jupyter notebook** support for cells that start with `%%jsoniq`

### Errors and type checking

Syntax errors show up as you type. RumbleDB's static type checker catches type problems too, like this string passed to a function that expects a decimal.

![A warning that an argument requires xs:decimal but xs:string was found](https://github.com/user-attachments/assets/fad396a2-73a2-4a47-95e6-f0c0c8ebb71b)

### Completion and hover

Object fields in completion come from the inferred type, so `$o.` lists the fields that `$o` actually has. Types from imported schemas are included too.

In the path of a file that a function reads, such as `json-lines("data/")`, or of a module or schema import, completion lists the files and directories there.

![Completion after $o. listing the fields customer, id and total with their types](https://github.com/user-attachments/assets/7d398180-82bc-4ed7-b404-af1aa038c6b8)

Hover over a variable to see its inferred type, or over a function to read its documentation.

![Hovering over $revenue shows its inferred object type](https://github.com/user-attachments/assets/8e2ae778-fded-41db-9f46-d76ae8cf1427)

### Navigation

Go to definition, find references and rename. References are found across the modules in your workspace.

![The References view listing three uses of pricing:with-tax across three files](https://github.com/user-attachments/assets/ed9661c9-5173-4542-b070-72d473ae0858)

### Running queries

Click **Run Query** above the first line, or the play button in the editor title bar. Results open in a panel beside your code. You can switch between a list and a table, filter the results, and open the raw output in an editor tab.

### Jupyter notebooks

Cells that start with `%%jsoniq` get language support in VS Code's Jupyter notebooks. This extension doesn't run those cells. For that, you need the [`jsoniq`](https://pypi.org/project/jsoniq/) Python package, which requires Python 3.11+ and Java 17 or 21. Run this in the notebook first:

```python
%pip install jsoniq
%load_ext jsoniqmagic
```

## Requirements

Type checking, type-aware completion and running queries need **Java 17 or newer** on your `PATH`. The first time they are needed, the extension downloads the RumbleDB wrapper, a large JAR, and verifies its checksum before using it. After that it stays cached.

Without Java, the features based on the parser still work.

## Settings

| Setting                               | Default      | Description                                                                    |
| ------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `jsoniq.lsp.wrapper.enabled`          | `true`       | Use RumbleDB through the Java wrapper.                                         |
| `jsoniq.lsp.wrapper.lakehouseFormats` | none enabled | Lakehouse formats to enable in RumbleDB's Spark session. Only `delta` for now. |
| `jsoniq.lsp.wrapper.sparkConf`        | `{}`         | Other Spark properties for the wrapper. Only `spark.*` keys are used.          |

When you change these settings, you are asked to restart the language server to apply them.

### Delta Lake

Tick `delta` under `jsoniq.lsp.wrapper.lakehouseFormats` to read Delta tables with `delta-file()` and `table()`:

```json
"jsoniq.lsp.wrapper.lakehouseFormats": { "delta": true }
```

## Feedback

Found a bug or missing a feature? [Open an issue](https://github.com/RumbleDB/language-tools/issues).
