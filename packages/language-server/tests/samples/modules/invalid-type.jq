module namespace invalid = "urn:invalid-type";

declare function invalid:value() as integer {
  "not an integer"
};
