module namespace a = "urn:cycle:a";

import module namespace b = "urn:cycle:b" at "cycle-b.jq";

declare variable $a:x := $b:y;
