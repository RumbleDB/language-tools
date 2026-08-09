module namespace b = "urn:cycle:b";

import module namespace a = "urn:cycle:a" at "cycle-a.jq";

declare variable $b:y := $a:x;
