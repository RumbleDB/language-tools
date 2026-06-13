The grammar file has been copied from the RumbleDB/rumble repository and modified slightly to ensure it works well with the language server. For example, some rule definitions have been changed so that the completion engine can work properly (without exploring too many paths).

```diff
--- a/packages/language-server/src/parser/adapters/xquery/grammar/XQueryParser.g4
+++ b/packages/language-server/src/parser/adapters/xquery/grammar/XQueryParser.g4
@@ -468,7 +468,7 @@ dirAttributeContentApos : contentChar
                         ;

 // helper rule to match any content character
-contentChar:              ContentChar+ ;
+contentChar:              ContentChar ;

 dirElemContent: directConstructor
               | commonContent

@@ -837,21 +837,19 @@ stringLiteral : stringLiteralQuot
               | stringLiteralApos
               ;

-stringContentQuot : ContentChar+
+stringContentQuot : ContentChar
                   | LBRACE expr? RBRACE?
                   | RBRACE
                   | DOUBLE_LBRACE
                   | DOUBLE_RBRACE
-                  | noQuotesNoBracesNoAmpNoLAng
                   | stringLiteralApos
                   ;

-stringContentApos : ContentChar+
+stringContentApos : ContentChar
                   | LBRACE expr? RBRACE?
                   | RBRACE
                   | DOUBLE_LBRACE
```
