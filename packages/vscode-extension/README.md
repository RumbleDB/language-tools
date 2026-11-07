# JSONiq and XQuery Language Support

Write and run JSONiq and XQuery in VS Code, with [RumbleDB](https://rumbledb.org/) checking your queries and executing them. The extension handles `.jq`, `.jsoniq`, `.jqm`, `.xq`, `.xqy`, `.xquery` and `.xqm` files.

## Run a query and browse the results

Click **Run Query** above the first line, or the play button in the editor title bar. Results open in a panel beside your code. You can switch between a list and a table, filter the results, and open the raw output in an editor tab.

![A JSONiq query with its results shown as a table and as an expandable list](https://github.com/user-attachments/assets/5f271ee2-1967-439b-86c1-5f5122549579)

## Find errors before you run

Syntax errors show up as you type. RumbleDB's static type checker catches type problems too, like this string passed to a function that expects a decimal.

![A warning that an argument requires xs:decimal but xs:string was found](https://github.com/user-attachments/assets/fad396a2-73a2-4a47-95e6-f0c0c8ebb71b)

## Completion and hover that know your data

Completion covers keywords, built-in and user-defined functions, variables, types, object fields and path steps, including types from imported schemas. Object fields come from the inferred type, so `$o.` lists the fields that `$o` actually has.

![Completion after $o. listing the fields customer, id and total with their types](https://github.com/user-attachments/assets/7d398180-82bc-4ed7-b404-af1aa038c6b8)

Hover over a variable to see its inferred type, or over a function to read its documentation.

![Hovering over $revenue shows its inferred object type](https://github.com/user-attachments/assets/8e2ae778-fded-41db-9f46-d76ae8cf1427)

## Navigate across files

Go to definition, find references and rename work on your code, and references are found across the modules in your workspace.

![The References view listing three uses of pricing:with-tax across three files](https://github.com/user-attachments/assets/ed9661c9-5173-4542-b070-72d473ae0858)

## Also included

- Document outline, and clickable links on module and schema imports
- Document formatting
- Signature help and inlay hints for function calls
- Highlighting based on the parser, on top of the TextMate grammars
- Language support in Jupyter notebook cells that start with `%%jsoniq`

## Requirements

Type checking, type-aware completion and running queries need **Java 17 or newer** on your `PATH`. The first time they are needed, the extension downloads the RumbleDB wrapper, a large JAR, and verifies its checksum before using it. After that it stays cached.

Without Java, the features based on the parser still work.

## Settings

| Setting                      | Default | Description                                                              |
| ---------------------------- | ------- | ------------------------------------------------------------------------ |
| `jsoniq.lsp.wrapper.enabled` | `true`  | Use RumbleDB through the Java wrapper. Reload the window after changing. |

## Feedback

Found a bug or missing a feature? [Open an issue](https://github.com/RumbleDB/language-tools/issues).
