module namespace lib = "urn:language-server:test";

declare function lib:double($value) {
  $value * 2
};

declare variable $lib:answer := 42;
