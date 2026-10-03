import { For } from "solid-js";

/** Highlight markup as text; result XML is never interpreted as HTML. */
export function XmlSource(props: { source: string }) {
    const tokens = () =>
        props.source.split(
            /(<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][\w:.-]*(?:[^<>"']|"[^"]*"|'[^']*')*>)/g,
        );
    return (
        <pre class="text-xs font-mono whitespace-pre-wrap break-words text-on-surface">
            <For each={tokens()}>
                {(token, index) => <span class={index() % 2 ? "xml-tag" : ""}>{token}</span>}
            </For>
        </pre>
    );
}
