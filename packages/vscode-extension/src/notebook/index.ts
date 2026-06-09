import { NotebookCellTextDocumentFilter } from "vscode-languageclient";

export const JUPYTER_NOTEBOOK_SELECTOR = {
    notebook: "jupyter-notebook",

    /// It must be Python because JSONiq cells in Jupyter notebooks are represented as Python cells with a magic command (`%%jsoniq`) at the beginning.
    /// If this is set to `jsoniq`, VS Code Jupyter extension won't be able to run the cell because there is no kernel registered for `jsoniq` language
    language: "python",
} satisfies NotebookCellTextDocumentFilter;
