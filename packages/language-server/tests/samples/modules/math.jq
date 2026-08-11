module namespace math = "math.jq";

(: Keep exported declarations beyond any plausible offset in the short importer.
   Imported visibility must never depend on offsets in this source document. :)

declare variable $math:x := 2;

declare function math:func($y) {
  $y + 4
};

declare %private variable $math:secret := 99;

declare %private function math:hidden() {
  $math:secret
};
