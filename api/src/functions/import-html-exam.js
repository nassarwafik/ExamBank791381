const { app } = require("@azure/functions");
const {
  BlobServiceClient
} = require("@azure/storage-blob");

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { requireBuilderAuth } = require("../lib/builder-auth");


const RAW_CONTAINER = "raw";
const BANK_CONTAINER = "bank";
const ASSETS_CONTAINER = "assets";

const INDEX_BLOB =
  "index/questions-index.json";


// Pilot answer map embedded for the 2024 exam.
// Future exams can use external JSON files under
// api/src/data/answer-maps/<sourceId>.json.
const BUILTIN_DERIVED_ANSWER_MAPS = {
  "791381-2024": {
  "schemaVersion": 1,
  "sourceId": "791381-2024",
  "examCode": "791381",
  "year": 2024,
  "provenance": {
    "kind": "ai-derived",
    "model": "GPT-5.6 Sol",
    "official": false,
    "note": "Answers derived by reviewing the 2024 exam HTML/PDF. ready entries may be merged automatically; needsReview entries should not become official answers without review."
  },
  "summary": {
    "questionCount": 41,
    "ready": 37,
    "needsReview": 4
  },
  "answers": {
    "1": {
      "answer": {
        "mode": "anyAccepted",
        "values": [
          "11000001"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "2": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "b",
        "values": [
          "b"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "3": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "صحيح",
          "غير صحيح",
          "غير صحيح",
          "صحيح"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "4": {
      "suggestedAnswer": {
        "mode": "anyAccepted",
        "values": [
          "b",
          "c"
        ]
      },
      "confidence": 0.45,
      "status": "needsReview",
      "reason": "سؤال APIPA ملتبس شبكيًا؛ يلزم اعتماد مفتاح/معيار المنهاج قبل التصحيح الآلي."
    },
    "5": {
      "suggestedAnswer": {
        "mode": "exactSequence",
        "values": [
          "configure terminal",
          "hostname EXAM"
        ]
      },
      "confidence": 0.9,
      "status": "needsReview",
      "reason": "الـPDF يظهر Router>enable مكتملًا وسطرين فارغين فقط، بينما HTML يحتوي 3 حقول إدخال."
    },
    "6": {
      "answer": {
        "mode": "anyAccepted",
        "values": [
          "ping 192.168.1.2"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "7": {
      "answer": {
        "mode": "anyAccepted",
        "values": [
          "47"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "8": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "c",
        "values": [
          "c"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "9": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "غير صحيح",
          "غير صحيح"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "10": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "b",
        "values": [
          "b"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "11": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "a",
        "values": [
          "a"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "12": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "c",
        "values": [
          "c"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "13": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "c",
        "values": [
          "c"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "14": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "a",
        "values": [
          "a"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "15": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "a",
        "values": [
          "a"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "16": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "c",
        "values": [
          "c"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "17": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "غير صحيح",
          "صحيح",
          "غير صحيح",
          "غير صحيح"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "18": {
      "answer": {
        "mode": "anyAccepted",
        "values": [
          "10.0.0.0"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "19": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "c",
        "values": [
          "c"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "20": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "d",
        "values": [
          "d"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "21": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "b",
        "values": [
          "b"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "22": {
      "answer": {
        "mode": "anyAccepted",
        "values": [
          "254"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "23": {
      "suggestedAnswer": {
        "mode": "exactSequence",
        "values": [
          "غير صحيح",
          "صحيح",
          "غير صحيح"
        ]
      },
      "confidence": 0.6,
      "status": "needsReview",
      "reason": "العبارة الثالثة حول مسطح الأمان تحتاج اعتماد تعليمات المختبر/المفتاح الرسمي."
    },
    "24": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "b",
        "values": [
          "b"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "25": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "d",
        "values": [
          "d"
        ]
      },
      "confidence": 0.99,
      "status": "ready"
    },
    "أ": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "c",
        "values": [
          "c"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 26
    },
    "ب": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "d",
        "values": [
          "d"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 27
    },
    "ج": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "صحيح",
          "غير صحيح",
          "صحيح",
          "صحيح"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 28
    },
    "د": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "c",
        "values": [
          "c"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 29
    },
    "هـ": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "a",
        "values": [
          "a"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 30
    },
    "و": {
      "answer": {
        "mode": "anyAccepted",
        "values": [
          "tikshuv5",
          "Tikshuv5",
          "TIKSHUV5"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 31
    },
    "ز": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "غير صحيح",
          "صحيح"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 32
    },
    "ح": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "صحيح",
          "غير صحيح"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 33
    },
    "ط": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "d",
        "values": [
          "d"
        ]
      },
      "confidence": 0.98,
      "status": "ready",
      "ordinal": 34
    },
    "ي": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "b",
        "values": [
          "b"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 35
    },
    "ي أ": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "network 192.168.10.0 0.0.0.255 area 0",
          "network 172.16.0.0 0.0.255.255 area 0"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 36
    },
    "ي ب": {
      "answer": {
        "mode": "singleChoice",
        "correctOptionValue": "c",
        "values": [
          "c"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 37
    },
    "ي ج": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "254",
          "255.255.255.0"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 38
    },
    "ي د": {
      "suggestedAnswer": {
        "mode": "exactSequence",
        "values": [
          "deny host 192.16.2.1",
          "permit",
          "fa0/0"
        ]
      },
      "acceptedPerField": [
        [
          "deny host 192.16.2.1",
          "deny 192.16.2.1 0.0.0.0"
        ],
        [
          "permit"
        ],
        [
          "fa0/0",
          "FastEthernet0/0"
        ]
      ],
      "confidence": 0.7,
      "status": "needsReview",
      "ordinal": 39,
      "reason": "الرسم الرسمي يضع تسمية Fa0/0 على وصلتي R1، لذلك واجهة تطبيق ACL ملتبسة."
    },
    "ط و": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "صحيح",
          "غير صحيح"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 40
    },
    "ط ز": {
      "answer": {
        "mode": "exactSequence",
        "values": [
          "غير صحيح",
          "صحيح",
          "غير صحيح",
          "صحيح"
        ]
      },
      "confidence": 0.99,
      "status": "ready",
      "ordinal": 41
    }
  }
}
};


// ==========================================================
// HTML constants
// ==========================================================

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);


// ==========================================================
// Stream helpers
// ==========================================================

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(
      Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}


async function downloadBlobText(
  containerClient,
  blobName
) {
  const blobClient =
    containerClient.getBlobClient(
      blobName
    );

  const response =
    await blobClient.download();

  if (!response.readableStreamBody) {
    throw new Error(
      `Unable to read blob: ${blobName}`
    );
  }

  const buffer =
    await streamToBuffer(
      response.readableStreamBody
    );

  return buffer.toString("utf8");
}


// ==========================================================
// Upload helpers
// ==========================================================

async function uploadText(
  containerClient,
  blobName,
  text,
  contentType
) {
  const blockBlobClient =
    containerClient
      .getBlockBlobClient(
        blobName
      );

  await blockBlobClient.uploadData(
    Buffer.from(
      text,
      "utf8"
    ),
    {
      blobHTTPHeaders: {
        blobContentType:
          contentType
      }
    }
  );
}


async function uploadJson(
  containerClient,
  blobName,
  value
) {
  await uploadText(
    containerClient,
    blobName,
    JSON.stringify(
      value,
      null,
      2
    ),
    "application/json; charset=utf-8"
  );
}


// ==========================================================
// Existing index
// ==========================================================

async function readExistingIndex(
  bankContainer
) {
  const blobClient =
    bankContainer.getBlobClient(
      INDEX_BLOB
    );

  if (
    !(await blobClient.exists())
  ) {
    return {
      schemaVersion: 1,
      updatedAt: null,
      questionCount: 0,
      questions: []
    };
  }

  const text =
    await downloadBlobText(
      bankContainer,
      INDEX_BLOB
    );

  return JSON.parse(text);
}


// ==========================================================
// HTML entities
// ==========================================================

function decodeEntities(value) {
  return String(value || "")
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&quot;/gi,
      "\""
    )
    .replace(
      /&#39;|&apos;/gi,
      "'"
    )
    .replace(
      /&#(\d+);/g,
      (_, number) =>
        String.fromCodePoint(
          Number(number)
        )
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, number) =>
        String.fromCodePoint(
          parseInt(
            number,
            16
          )
        )
    );
}


// ==========================================================
// Parse HTML attributes
// ==========================================================

function parseAttrs(source) {
  const attrs = {};

  const regex =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  let match;

  while (
    (match = regex.exec(source))
  ) {
    const key =
      String(
        match[1] || ""
      ).toLowerCase();

    if (
      !key ||
      key === "<" ||
      key.startsWith("/")
    ) {
      continue;
    }

    attrs[key] =
      decodeEntities(
        match[2] ??
        match[3] ??
        match[4] ??
        ""
      );
  }

  return attrs;
}


// ==========================================================
// Small HTML parser
//
// No external npm package required.
// We only need enough DOM structure for the exam HTML files.
// ==========================================================

function parseHtml(html) {
  const cleaned =
    String(html || "")
      .replace(
        /<!--([\s\S]*?)-->/g,
        ""
      )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        ""
      )
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        ""
      );

  const root = {
    tag: "#root",
    attrs: {},
    children: [],
    parent: null
  };

  let current = root;

  const tokens =
    cleaned.match(
      /<[^>]+>|[^<]+/g
    ) || [];

  for (const token of tokens) {

    // ------------------------------------------------------
    // Closing tag
    // ------------------------------------------------------

    if (
      token.startsWith("</")
    ) {
      const match =
        token.match(
          /^<\/\s*([^\s>]+)/
        );

      const tag =
        match?.[1]
          ?.toLowerCase();

      if (!tag) {
        continue;
      }

      let node =
        current;

      while (
        node !== root &&
        node.tag !== tag
      ) {
        node =
          node.parent;
      }

      if (
        node !== root
      ) {
        current =
          node.parent;
      }

      continue;
    }


    // ------------------------------------------------------
    // Doctype etc.
    // ------------------------------------------------------

    if (
      token.startsWith("<!") ||
      token.startsWith("<?")
    ) {
      continue;
    }


    // ------------------------------------------------------
    // Opening tag
    // ------------------------------------------------------

    if (
      token.startsWith("<")
    ) {
      const match =
        token.match(
          /^<\s*([^\s/>]+)/
        );

      if (!match) {
        continue;
      }

      const tag =
        match[1]
          .toLowerCase();

      const attrText =
        token.slice(
          match[0].length,
          -1
        );

      const node = {
        tag,
        attrs:
          parseAttrs(
            attrText
          ),
        children: [],
        parent:
          current
      };

      current.children.push(
        node
      );

      if (
        !VOID_TAGS.has(tag) &&
        !token.endsWith("/>")
      ) {
        current =
          node;
      }

      continue;
    }


    // ------------------------------------------------------
    // Text node
    // ------------------------------------------------------

    current.children.push({
      tag: "#text",
      text:
        decodeEntities(
          token
        ),
      attrs: {},
      children: [],
      parent:
        current
    });
  }

  return root;
}


// ==========================================================
// DOM helpers
// ==========================================================

function classList(node) {
  return String(
    node?.attrs?.class || ""
  )
    .split(/\s+/)
    .filter(Boolean);
}


function hasClass(
  node,
  className
) {
  return classList(node)
    .includes(
      className
    );
}


function findAll(
  node,
  predicate,
  result = []
) {
  for (
    const child
    of node?.children || []
  ) {
    if (
      child.tag === "#text"
    ) {
      continue;
    }

    if (
      predicate(child)
    ) {
      result.push(
        child
      );
    }

    findAll(
      child,
      predicate,
      result
    );
  }

  return result;
}


function findFirst(
  node,
  predicate
) {
  for (
    const child
    of node?.children || []
  ) {
    if (
      child.tag === "#text"
    ) {
      continue;
    }

    if (
      predicate(child)
    ) {
      return child;
    }

    const found =
      findFirst(
        child,
        predicate
      );

    if (found) {
      return found;
    }
  }

  return null;
}


function textContent(node) {
  if (!node) {
    return "";
  }

  if (
    node.tag === "#text"
  ) {
    return node.text;
  }

  return (
    node.children || []
  )
    .map(
      textContent
    )
    .join(" ")
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function escapeHtml(value) {
  return String(value || "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}


function serializeNode(node) {
  if (
    node.tag === "#text"
  ) {
    return escapeHtml(
      node.text
    );
  }

  const attrs =
    Object
      .entries(
        node.attrs || {}
      )
      .map(
        ([key, value]) =>
          value === ""
            ? key
            : `${key}="${escapeHtml(
                value
              )}"`
      )
      .join(" ");

  const open =
    `<${node.tag}${
      attrs
        ? ` ${attrs}`
        : ""
    }>`;


  if (
    VOID_TAGS.has(
      node.tag
    )
  ) {
    return open;
  }

  return (
    open +
    (
      node.children || []
    )
      .map(
        serializeNode
      )
      .join("") +
    `</${node.tag}>`
  );
}


function innerHtml(node) {
  return (
    node?.children || []
  )
    .map(
      serializeNode
    )
    .join("");
}


function ancestors(node) {
  const result = [];

  for (
    let parent =
      node?.parent;
    parent;
    parent =
      parent.parent
  ) {
    result.push(
      parent
    );
  }

  return result;
}


// ==========================================================
// Extract JavaScript const object/array
// ==========================================================

function extractBalancedConst(
  source,
  constName
) {
  const pattern =
    new RegExp(
      `\\bconst\\s+${constName}\\s*=\\s*`
    );

  const match =
    pattern.exec(
      source
    );

  if (!match) {
    return null;
  }


  let start =
    match.index +
    match[0].length;


  while (
    /\s/.test(
      source[start] || ""
    )
  ) {
    start++;
  }


  const opening =
    source[start];

  const closing =
    opening === "{"
      ? "}"
      : opening === "["
        ? "]"
        : null;


  if (!closing) {
    return null;
  }


  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;


  for (
    let i = start;
    i < source.length;
    i++
  ) {
    const char =
      source[i];

    const next =
      source[i + 1];


    // ------------------------------------------------------
    // JS line comment
    // ------------------------------------------------------

    if (lineComment) {
      if (
        char === "\n"
      ) {
        lineComment = false;
      }

      continue;
    }


    // ------------------------------------------------------
    // JS block comment
    // ------------------------------------------------------

    if (blockComment) {
      if (
        char === "*" &&
        next === "/"
      ) {
        blockComment = false;
        i++;
      }

      continue;
    }


    // ------------------------------------------------------
    // Inside string
    // ------------------------------------------------------

    if (quote) {
      if (escaped) {
        escaped = false;
      }
      else if (
        char === "\\"
      ) {
        escaped = true;
      }
      else if (
        char === quote
      ) {
        quote = null;
      }

      continue;
    }


    // ------------------------------------------------------
    // Start comments
    // ------------------------------------------------------

    if (
      char === "/" &&
      next === "/"
    ) {
      lineComment = true;
      i++;
      continue;
    }


    if (
      char === "/" &&
      next === "*"
    ) {
      blockComment = true;
      i++;
      continue;
    }


    // ------------------------------------------------------
    // Start string
    // ------------------------------------------------------

    if (
      char === "\"" ||
      char === "'" ||
      char === "`"
    ) {
      quote = char;
      continue;
    }


    // ------------------------------------------------------
    // Brackets
    // ------------------------------------------------------

    if (
      char === opening
    ) {
      depth++;
    }
    else if (
      char === closing
    ) {
      depth--;

      if (
        depth === 0
      ) {
        return source.slice(
          start,
          i + 1
        );
      }
    }
  }


  return null;
}


// ==========================================================
// Parse answer information
// ==========================================================

function parseNumericAnswers(
  source
) {
  const result = {};

  const literal =
    extractBalancedConst(
      source,
      "ANSWERS"
    );


  if (!literal) {
    return result;
  }


  const regex =
    /["']([^"']+)["']\s*:\s*(\d+)/g;

  let match;

  while (
    (match =
      regex.exec(literal))
  ) {
    result[
      match[1]
    ] = {
      kind:
        "index",
      value:
        Number(
          match[2]
        )
    };
  }

  return result;
}


// ==========================================================
// ANSWER_KEYS
// ==========================================================

function parseAnswerKeys(
  source
) {
  const result = {};

  const literal =
    extractBalancedConst(
      source,
      "ANSWER_KEYS"
    );


  if (!literal) {
    return result;
  }


  try {
    const object =
      JSON.parse(
        literal
      );


    for (
      const [
        key,
        value
      ]
      of Object.entries(
        object
      )
    ) {
      if (
        value?.correct !==
          undefined &&
        value?.correct !==
          null
      ) {
        result[key] = {
          kind:
            "value",
          value:
            String(
              value.correct
            )
        };
      }
      else if (
        Array.isArray(
          value?.accepted
        )
      ) {
        result[key] = {
          kind:
            "accepted",
          values:
            value.accepted
              .map(
                String
              )
        };
      }
    }
  }
  catch {
    // Not all historical HTML files use strict JSON.
    // Continue importing and flag unresolved answers later.
  }


  return result;
}


// ==========================================================
// AK object
// ==========================================================

function parseAk(
  source
) {
  const result = {};

  const literal =
    extractBalancedConst(
      source,
      "AK"
    );


  if (!literal) {
    return result;
  }


  const regex =
    /\b([A-Za-z_$][\w$]*)\s*:\s*(?:'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)"|(-?\d+(?:\.\d+)?))/g;


  let match;


  while (
    (match =
      regex.exec(literal))
  ) {
    const value =
      String(
        match[2] ??
        match[3] ??
        match[4] ??
        ""
      )
        .replace(
          /\\'/g,
          "'"
        )
        .replace(
          /\\"/g,
          "\""
        );


    result[
      match[1]
    ] = {
      kind:
        "value",
      value
    };
  }


  return result;
}


// ==========================================================
// EXAM object
//
// Several 2025 HTML files contain:
//
// const EXAM = {
//   "s1": [
//      {
//        "id": "s1q1",
//        "answer": "0"
//      }
//   ]
// }
//
// Answers here are zero-based option indices.
// ==========================================================

function parseExamObject(
  source
) {
  const result = {};

  const literal =
    extractBalancedConst(
      source,
      "EXAM"
    );


  if (!literal) {
    return result;
  }


  try {
    const object =
      JSON.parse(
        literal
      );


    for (
      const collection
      of Object.values(
        object
      )
    ) {
      if (
        !Array.isArray(
          collection
        )
      ) {
        continue;
      }


      for (
        const question
        of collection
      ) {
        if (
          !question?.id
        ) {
          continue;
        }


        if (
          question.answer !==
            undefined &&
          question.answer !==
            null
        ) {
          result[
            question.id
          ] = {
            kind:
              "index0",
            value:
              Number(
                question.answer
              )
          };
        }


        if (
          Array.isArray(
            question.answers
          )
        ) {
          result[
            question.id
          ] = {
            kind:
              "sequence",
            values:
              question.answers
                .map(
                  String
                )
          };
        }
      }
    }
  }
  catch {
    // Continue.
    // The HTML might use JS syntax rather than pure JSON.
  }


  return result;
}


// ==========================================================
// Some exam pages grade answers directly in JS.
//
// Example:
// g("q1", "c")
// ==========================================================

function parseGraderConditions(
  source
) {
  const result = {};

  let match;


  const genericRadio =
    /\bg\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g;


  while (
    (match =
      genericRadio.exec(
        source
      ))
  ) {
    result[
      match[1]
    ] = {
      kind:
        "value",
      value:
        match[2]
    };
  }


  const textEquality =
    /nrm\(getT\(['"]([^'"]+)['"]\)\)\s*===\s*['"]([^'"]*)['"]/g;


  while (
    (match =
      textEquality.exec(
        source
      ))
  ) {
    result[
      match[1]
    ] = {
      kind:
        "value",
      value:
        match[2]
    };
  }


  const selectEquality =
    /getS\(['"]([^'"]+)['"]\)\s*===\s*['"]([^'"]*)['"]/g;


  while (
    (match =
      selectEquality.exec(
        source
      ))
  ) {
    result[
      match[1]
    ] = {
      kind:
        "value",
      value:
        match[2]
    };
  }


  return result;
}


// ==========================================================
// Complete answer map
// ==========================================================

function buildAnswerMap(
  source
) {
  return Object.assign(
    {},
    parseNumericAnswers(
      source
    ),
    parseAnswerKeys(
      source
    ),
    parseAk(
      source
    ),
    parseExamObject(
      source
    ),
    parseGraderConditions(
      source
    )
  );
}


// ==========================================================
// Section detection
// ==========================================================

function getSectionInfo(
  card
) {
  const section =
    ancestors(card)
      .find(
        node =>
          hasClass(
            node,
            "section"
          ) ||
          hasClass(
            node,
            "section-block"
          )
      );


  if (!section) {
    return {
      originalSection:
        "",
      section:
        "LEGACY"
    };
  }


  const header =
    findFirst(
      section,
      node =>
        hasClass(
          node,
          "section-header"
        )
    );


  const originalSection =
    textContent(
      header
    );


  let mapped =
    "LEGACY";


  // --------------------------------------------------------
  // BASIC
  // --------------------------------------------------------

  if (
    /أساس|الأساس|basic/i
      .test(
        originalSection
      )
  ) {
    mapped =
      "BASIC";
  }


  // --------------------------------------------------------
  // INFRASTRUCTURE
  // --------------------------------------------------------

  else if (
    /البنى|بنى تحتية|تخصص.*اتصال|شبكات\s*\/\s*اتصالات|infrastructure/i
      .test(
        originalSection
      )
  ) {
    mapped =
      "INFRASTRUCTURE";
  }


  return {
    originalSection,
    section:
      mapped
  };
}


// ==========================================================
// Controls
// ==========================================================

function getControls(
  card
) {
  return findAll(
    card,
    node => {

      if (
        ![
          "input",
          "textarea",
          "select"
        ].includes(
          node.tag
        )
      ) {
        return false;
      }


      const type =
        String(
          node.attrs.type || ""
        )
          .toLowerCase();


      if (
        [
          "button",
          "submit",
          "reset",
          "hidden"
        ].includes(
          type
        )
      ) {
        return false;
      }


      return true;
    }
  );
}


// ==========================================================
// Radio option wrappers
// ==========================================================

function getOptionNodes(
  card
) {
  let nodes =
    findAll(
      card,
      node =>
        hasClass(
          node,
          "opt-label"
        )
    );


  if (
    !nodes.length
  ) {
    nodes =
      findAll(
        card,
        node =>
          hasClass(
            node,
            "opt"
          )
      );
  }


  return nodes.filter(
    node =>
      findFirst(
        node,
        child =>
          child.tag ===
            "input" &&
          String(
            child.attrs.type ||
            "radio"
          )
            .toLowerCase()
          ===
          "radio"
      )
  );
}


// ==========================================================
// Ancestor option/label
// ==========================================================

function getControlLabel(
  control
) {
  return ancestors(
    control
  )
    .find(
      node =>
        node.tag ===
          "label" ||
        hasClass(
          node,
          "opt"
        ) ||
        hasClass(
          node,
          "opt-label"
        )
    ) || null;
}


// ==========================================================
// Direct correct marker
// ==========================================================

function isMarkedCorrect(
  node
) {
  if (!node) {
    return false;
  }


  return (
    Object.prototype
      .hasOwnProperty
      .call(
        node.attrs || {},
        "data-correct"
      )
  );
}


// ==========================================================
// Direct answer:
// single multiple-choice
// ==========================================================

function getDirectSingleChoiceAnswer(
  card
) {
  const options =
    getOptionNodes(
      card
    );


  for (
    let index = 0;
    index < options.length;
    index++
  ) {
    const option =
      options[index];


    const input =
      findFirst(
        option,
        node =>
          node.tag ===
          "input"
      );


    if (
      isMarkedCorrect(
        option
      ) ||
      isMarkedCorrect(
        input
      )
    ) {
      return {
        kind:
          "index",
        value:
          index + 1
      };
    }
  }


  return null;
}


// ==========================================================
// Direct answers for multi-field questions.
//
// Supports:
// - data-correct on radio
// - data-correct on surrounding label
// - option[data-correct] inside select
// - input/textarea[data-answer]
// ==========================================================

function getDirectSequenceAnswer(
  card
) {
  const controls =
    getControls(
      card
    );


  const values = [];

  const handledRadioGroups =
    new Set();


  for (
    const control
    of controls
  ) {
    const type =
      String(
        control.attrs.type || ""
      )
        .toLowerCase();


    // ------------------------------------------------------
    // Radio group
    // ------------------------------------------------------

    if (
      control.tag === "input" &&
      type === "radio"
    ) {
      const name =
        control.attrs.name ||
        `radio-${values.length}`;


      if (
        handledRadioGroups.has(
          name
        )
      ) {
        continue;
      }


      handledRadioGroups.add(
        name
      );


      const group =
        controls.filter(
          candidate =>
            candidate.tag ===
              "input" &&
            String(
              candidate.attrs.type ||
              ""
            )
              .toLowerCase()
            ===
              "radio" &&
            (
              candidate.attrs.name ||
              ""
            )
            ===
              (
                control.attrs.name ||
                ""
              )
        );


      const correct =
        group.find(
          candidate => {

            if (
              isMarkedCorrect(
                candidate
              )
            ) {
              return true;
            }


            const label =
              getControlLabel(
                candidate
              );


            return isMarkedCorrect(
              label
            );
          }
        );


      if (correct) {
        const label =
          getControlLabel(
            correct
          );


        values.push(
          String(
            correct.attrs.value ||
            textContent(
              label
            ) ||
            ""
          )
        );
      }


      continue;
    }


    // ------------------------------------------------------
    // Text answer
    // ------------------------------------------------------

    if (
      control.attrs[
        "data-answer"
      ]
    ) {
      values.push(
        String(
          control.attrs[
            "data-answer"
          ]
        )
      );

      continue;
    }


    // ------------------------------------------------------
    // Select
    // ------------------------------------------------------

    if (
      control.tag ===
      "select"
    ) {
      const correctOption =
        findFirst(
          control,
          node =>
            node.tag ===
              "option" &&
            isMarkedCorrect(
              node
            )
        );


      if (
        correctOption
      ) {
        values.push(
          String(
            correctOption
              .attrs
              .value ||
            textContent(
              correctOption
            )
          )
        );
      }
    }
  }


  if (
    !values.length
  ) {
    return null;
  }


  return {
    kind:
      "sequence",
    values
  };
}


// ==========================================================
// Answer lookup candidates
// ==========================================================

function answerCandidates(
  card,
  questionNumber
) {
  const result =
    new Set();


  const cardId =
    card.attrs.id || "";


  const dataQid =
    card.attrs[
      "data-qid"
    ] || "";


  if (cardId) {
    result.add(
      cardId.replace(
        /^card_/,
        ""
      )
    );
  }


  if (dataQid) {
    result.add(
      dataQid
    );
  }


  if (questionNumber) {
    result.add(
      questionNumber
    );
  }


  const numericOnly =
    String(
      questionNumber ||
      ""
    )
      .replace(
        /[^0-9A-Za-z_]+/g,
        ""
      );


  if (numericOnly) {
    result.add(
      `q${numericOnly}`
    );
  }


  for (
    const control
    of getControls(card)
  ) {
    if (
      control.attrs.id
    ) {
      result.add(
        control.attrs.id
      );
    }


    if (
      control.attrs.name
    ) {
      result.add(
        control.attrs.name
      );
    }
  }


  return [
    ...result
  ]
    .filter(
      Boolean
    );
}


// ==========================================================
// Points
// ==========================================================

function parsePoints(
  card
) {
  const node =
    findFirst(
      card,
      item =>
        hasClass(
          item,
          "q-marks"
        ) ||
        hasClass(
          item,
          "q-mark"
        ) ||
        hasClass(
          item,
          "mark"
        )
    );


  const match =
    textContent(
      node
    )
      .match(
        /(\d+(?:\.\d+)?)/
      );


  return match
    ? Number(
        match[1]
      )
    : null;
}


// ==========================================================
// Extract one question
// ==========================================================

function extractQuestion(
  card,
  ordinal,
  answerMap
) {
  const numberNode =
    findFirst(
      card,
      node =>
        hasClass(
          node,
          "q-num"
        )
    );


  const questionNumber =
    textContent(
      numberNode
    ) ||
    String(
      ordinal
    );


  const questionTextNode =
    findFirst(
      card,
      node =>
        hasClass(
          node,
          "q-text"
        )
    );


  // --------------------------------------------------------
  // Extra prompt text after image/code etc.
  // --------------------------------------------------------

  const extraText =
    findAll(
      card,
      node =>
        [
          "after",
          "q-after",
          "subhead",
          "prompt"
        ]
          .some(
            className =>
              hasClass(
                node,
                className
              )
          )
    )
      .map(
        textContent
      )
      .filter(
        Boolean
      );


  const questionText =
    [
      textContent(
        questionTextNode
      ),
      ...extraText
    ]
      .filter(
        Boolean
      )
      .join("\n");


  const optionNodes =
    getOptionNodes(
      card
    );


  const controls =
    getControls(
      card
    );


  const radioControls =
    controls.filter(
      control =>
        control.tag ===
          "input" &&
        String(
          control.attrs.type ||
          ""
        )
          .toLowerCase()
        ===
          "radio"
    );


  const nonRadioControls =
    controls.filter(
      control =>
        !(
          control.tag ===
            "input" &&
          String(
            control.attrs.type ||
            ""
          )
            .toLowerCase()
          ===
            "radio"
        )
    );


  // --------------------------------------------------------
  // Radio groups
  // --------------------------------------------------------

  const radioGroups = {};


  for (
    const radio
    of radioControls
  ) {
    const name =
      radio.attrs.name ||
      "__radio";


    if (
      !radioGroups[
        name
      ]
    ) {
      radioGroups[
        name
      ] = [];
    }


    radioGroups[
      name
    ].push(
      radio
    );
  }


  // --------------------------------------------------------
  // Detect question type
  // --------------------------------------------------------

  let type =
    "other";

  let options = [];

  const fields = [];


  // --------------------------------------------------------
  // Single MCQ
  // --------------------------------------------------------

  if (
    optionNodes.length &&
    Object.keys(
      radioGroups
    ).length === 1 &&
    nonRadioControls.length === 0
  ) {
    type =
      "multipleChoice";


    options =
      optionNodes.map(
        (
          optionNode,
          index
        ) => {

          const input =
            findFirst(
              optionNode,
              node =>
                node.tag ===
                "input"
            );


          return {
            value:
              String(
                input
                  ?.attrs
                  ?.value ??
                index + 1
              ),

            label:
              String(
                index + 1
              ),

            text:
              textContent(
                optionNode
              ),

            textHtml:
              innerHtml(
                optionNode
              ),

            order:
              index + 1
          };
        }
      );
  }


  // --------------------------------------------------------
  // Fields / short answers / T-F tables
  // --------------------------------------------------------

  else if (
    optionNodes.length ||
    Object.keys(
      radioGroups
    ).length ||
    nonRadioControls.length
  ) {
    const fieldCount =
      Object.keys(
        radioGroups
      ).length +
      nonRadioControls.length;


    type =
      fieldCount > 1
        ? "multiField"
        : "shortAnswer";


    let order = 1;


    // ------------------------------------------------------
    // Radio group fields
    // ------------------------------------------------------

    for (
      const [
        name,
        group
      ]
      of Object.entries(
        radioGroups
      )
    ) {
      fields.push({
        id:
          name,

        label:
          name,

        order:
          order++,

        kind:
          "choice",

        options:
          group.map(
            (
              input,
              index
            ) => {

              const label =
                getControlLabel(
                  input
                );


              return {
                value:
                  String(
                    input
                      .attrs
                      .value ??
                    index + 1
                  ),

                label:
                  String(
                    index + 1
                  ),

                text:
                  label
                    ? textContent(
                        label
                      )
                    : String(
                        input
                          .attrs
                          .value ??
                        index + 1
                      ),

                order:
                  index + 1
              };
            }
          )
      });
    }


    // ------------------------------------------------------
    // Text/select fields
    // ------------------------------------------------------

    for (
      const control
      of nonRadioControls
    ) {
      const field = {
        id:
          control.attrs.id ||
          control.attrs.name ||
          `field${order}`,

        label:
          control.attrs.placeholder ||
          control.attrs.name ||
          "",

        order:
          order++,

        kind:
          control.tag
      };


      // ----------------------------------------------------
      // Select options
      // ----------------------------------------------------

      if (
        control.tag ===
        "select"
      ) {
        const selectOptions =
          findAll(
            control,
            node =>
              node.tag ===
              "option"
          );


        field.options =
          selectOptions.map(
            (
              option,
              index
            ) => ({
              value:
                String(
                  option
                    .attrs
                    .value ??
                  textContent(
                    option
                  )
                ),

              label:
                String(
                  index + 1
                ),

              text:
                textContent(
                  option
                ),

              order:
                index + 1
            })
          );
      }


      fields.push(
        field
      );
    }
  }


  // --------------------------------------------------------
  // Find answer from JavaScript
  // --------------------------------------------------------

  const candidates =
    answerCandidates(
      card,
      questionNumber
    );


  const keyedAnswers =
    candidates
      .map(
        key => ({
          key,
          answer:
            answerMap[key]
        })
      )
      .filter(
        item =>
          item.answer
      );


  let rawAnswer =
    null;


  // --------------------------------------------------------
  // Multi field: match each field by id/name
  // --------------------------------------------------------

  if (
    type === "multiField" ||
    type === "shortAnswer"
  ) {
    const controlAnswers =
      [];


    for (
      const field
      of fields
    ) {
      const match =
        answerMap[
          field.id
        ];


      if (
        match?.kind ===
        "value"
      ) {
        controlAnswers.push(
          String(
            match.value
          )
        );
      }


      else if (
        match?.kind ===
        "accepted"
      ) {
        controlAnswers.push(
          ...match.values
            .map(
              String
            )
        );
      }


      else if (
        match?.kind ===
        "sequence"
      ) {
        controlAnswers.push(
          ...match.values
            .map(
              String
            )
        );
      }
    }


    if (
      controlAnswers.length
    ) {
      rawAnswer = {
        kind:
          "sequence",
        values:
          controlAnswers
      };
    }


    // ------------------------------------------------------
    // Try embedded data-correct / data-answer
    // ------------------------------------------------------

    if (
      !rawAnswer
    ) {
      rawAnswer =
        getDirectSequenceAnswer(
          card
        );
    }
  }


  // --------------------------------------------------------
  // Keyed JS answer
  // --------------------------------------------------------

  if (
    !rawAnswer &&
    keyedAnswers.length
  ) {
    rawAnswer =
      keyedAnswers[0]
        .answer;
  }


  // --------------------------------------------------------
  // Direct MCQ correct marker
  // --------------------------------------------------------

  if (
    !rawAnswer &&
    type ===
      "multipleChoice"
  ) {
    rawAnswer =
      getDirectSingleChoiceAnswer(
        card
      );
  }


  // --------------------------------------------------------
  // Convert raw answer to standard answer object
  // --------------------------------------------------------

  let answer = {
    mode:
      "manual",

    values: []
  };


  if (rawAnswer) {

    // ------------------------------------------------------
    // 1-based option index
    // ------------------------------------------------------

    if (
      type ===
        "multipleChoice" &&
      rawAnswer.kind ===
        "index"
    ) {
      const index =
        Number(
          rawAnswer.value
        ) - 1;


      if (
        options[index]
      ) {
        answer = {
          mode:
            "singleChoice",

          correctOptionValue:
            options[index]
              .value,

          correctOptionLabel:
            options[index]
              .label,

          correctText:
            options[index]
              .text,

          values: [
            options[index]
              .value
          ]
        };
      }
    }


    // ------------------------------------------------------
    // Zero-based option index
    // Used by const EXAM.
    // ------------------------------------------------------

    else if (
      type ===
        "multipleChoice" &&
      rawAnswer.kind ===
        "index0"
    ) {
      const index =
        Number(
          rawAnswer.value
        );


      if (
        options[index]
      ) {
        answer = {
          mode:
            "singleChoice",

          correctOptionValue:
            options[index]
              .value,

          correctOptionLabel:
            options[index]
              .label,

          correctText:
            options[index]
              .text,

          values: [
            options[index]
              .value
          ]
        };
      }
    }


    // ------------------------------------------------------
    // Explicit option value
    // ------------------------------------------------------

    else if (
      type ===
        "multipleChoice" &&
      rawAnswer.kind ===
        "value"
    ) {
      const rawValue =
        String(
          rawAnswer.value
        );


      let index =
        options.findIndex(
          option =>
            option.value
              .toLowerCase()
            ===
              rawValue
                .toLowerCase()
            ||
            option.text
              .toLowerCase()
            ===
              rawValue
                .toLowerCase()
        );


      // A/B/C/D
      if (
        index < 0 &&
        /^[a-d]$/i.test(
          rawValue
        )
      ) {
        index =
          rawValue
            .toLowerCase()
            .charCodeAt(0)
          -
          97;
      }


      if (
        index >= 0 &&
        options[index]
      ) {
        answer = {
          mode:
            "singleChoice",

          correctOptionValue:
            options[index]
              .value,

          correctOptionLabel:
            options[index]
              .label,

          correctText:
            options[index]
              .text,

          values: [
            options[index]
              .value
          ]
        };
      }
      else {
        answer = {
          mode:
            "anyAccepted",

          values: [
            rawValue
          ]
        };
      }
    }


    // ------------------------------------------------------
    // Accepted text answers
    // ------------------------------------------------------

    else if (
      rawAnswer.kind ===
      "accepted"
    ) {
      answer = {
        mode:
          "anyAccepted",

        values:
          rawAnswer.values
            .map(
              String
            )
      };
    }


    // ------------------------------------------------------
    // Sequence
    // ------------------------------------------------------

    else if (
      rawAnswer.kind ===
      "sequence"
    ) {
      answer = {
        mode:
          "exactSequence",

        values:
          rawAnswer.values
            .map(
              String
            )
      };
    }


    // ------------------------------------------------------
    // Single text
    // ------------------------------------------------------

    else if (
      rawAnswer.kind ===
      "value"
    ) {
      answer = {
        mode:
          "anyAccepted",

        values: [
          String(
            rawAnswer.value
          )
        ]
      };
    }
  }


  // --------------------------------------------------------
  // Section
  // --------------------------------------------------------

  const sectionInfo =
    getSectionInfo(
      card
    );


  // --------------------------------------------------------
  // Images
  // --------------------------------------------------------

  const imageSources =
    findAll(
      card,
      node =>
        node.tag ===
        "img"
    )
      .map(
        node =>
          node.attrs.src
      )
      .filter(
        Boolean
      );


  // --------------------------------------------------------
  // Source question id
  // --------------------------------------------------------

  const sourceQuestionId =
    card.attrs[
      "data-qid"
    ] ||
    String(
      card.attrs.id || ""
    )
      .replace(
        /^card_/,
        ""
      ) ||
    questionNumber;


  return {
    ordinal,

    questionNumber,

    sourceQuestionId,

    section:
      sectionInfo.section,

    originalSection:
      sectionInfo.originalSection,

    points:
      parsePoints(
        card
      ),

    type,

    originalType:
      type,

    text:
      questionText,

    textHtml:
      questionTextNode
        ? innerHtml(
            questionTextNode
          )
        : "",

    options,

    fields,

    parts: [],

    answer,

    hint: "",

    imageSources,

    rawCardHtml:
      innerHtml(
        card
      )
  };
}


// ==========================================================
// Ensure sourceQuestionId is unique
//
// Historical exams sometimes reuse "أ", "ب", etc.
// ==========================================================

function ensureUniqueSourceQuestionIds(
  questions
) {
  const used =
    new Map();


  for (
    const question
    of questions
  ) {
    const base =
      String(
        question
          .sourceQuestionId ||
        question
          .questionNumber ||
        `q${question.ordinal}`
      )
        .trim();


    const count =
      (
        used.get(
          base
        ) || 0
      ) + 1;


    used.set(
      base,
      count
    );


    if (
      count === 1
    ) {
      question
        .sourceQuestionId =
        base;
    }
    else {
      question
        .sourceQuestionId =
        `${base}-${count}`;
    }
  }


  return questions;
}


// ==========================================================
// Decode embedded data:image/...;base64
// ==========================================================

function decodeDataImage(
  dataUri
) {
  const match =
    String(
      dataUri || ""
    )
      .match(
        /^data:([^;]+);base64,(.*)$/s
      );


  if (!match) {
    return null;
  }


  const contentType =
    match[1] ||
    "image/png";


  const buffer =
    Buffer.from(
      match[2],
      "base64"
    );


  let extension =
    ".bin";


  if (
    contentType.includes(
      "png"
    )
  ) {
    extension =
      ".png";
  }


  else if (
    contentType.includes(
      "jpeg"
    ) ||
    contentType.includes(
      "jpg"
    )
  ) {
    extension =
      ".jpg";
  }


  else if (
    contentType.includes(
      "gif"
    )
  ) {
    extension =
      ".gif";
  }


  else if (
    contentType.includes(
      "webp"
    )
  ) {
    extension =
      ".webp";
  }


  return {
    contentType,
    buffer,
    extension
  };
}


// ==========================================================
// Build source ID
// ==========================================================

function buildSourceId(
  examCode,
  year,
  variant
) {
  return [
    examCode,
    year,
    variant
  ]
    .filter(
      value =>
        String(
          value || ""
        )
          .trim()
    )
    .map(
      value =>
        String(
          value
        )
          .trim()
    )
    .join("-");
}


// ==========================================================
// Optional AI-derived answer maps
//
// Files live under:
//   api/src/data/answer-maps/<sourceId>.json
//
// They never replace an answer extracted from the HTML unless
// the map entry is explicitly marked status="ready".
// needsReview entries are stored only as suggestedAnswer.
// ==========================================================

function loadDerivedAnswerMap(
  sourceId
) {
  if (
    Object.prototype
      .hasOwnProperty
      .call(
        BUILTIN_DERIVED_ANSWER_MAPS,
        sourceId
      )
  ) {
    return BUILTIN_DERIVED_ANSWER_MAPS[
      sourceId
    ];
  }


  const safeSourceId =
    String(sourceId || "")
      .replace(
        /[^0-9A-Za-z._-]/g,
        "_"
      );

  const filePath =
    path.join(
      __dirname,
      "..",
      "data",
      "answer-maps",
      `${safeSourceId}.json`
    );

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        filePath,
        "utf8"
      )
    );
  }
  catch (error) {
    throw new Error(
      `Invalid derived answer map for ${sourceId}: ${
        error instanceof Error
          ? error.message
          : "unknown JSON error"
      }`
    );
  }
}


function findDerivedAnswerEntry(
  answerDocument,
  question
) {
  const answers =
    answerDocument?.answers;

  if (
    !answers ||
    typeof answers !== "object"
  ) {
    return null;
  }

  // Prefer an explicit ordinal match. This is stable even when
  // historical exams reuse letters such as أ / ب / ج.
  for (
    const entry
    of Object.values(answers)
  ) {
    if (
      Number(entry?.ordinal) ===
      Number(question.ordinal)
    ) {
      return entry;
    }
  }

  // Questions 1..25 in older exams commonly use their ordinal
  // directly as the key.
  const ordinalKey =
    String(question.ordinal);

  if (answers[ordinalKey]) {
    return answers[ordinalKey];
  }

  // Fallback to the visible question number / source id.
  const candidates = [
    question.questionNumber,
    question.sourceQuestionId
  ]
    .map(
      value =>
        String(value || "")
          .trim()
    )
    .filter(Boolean);

  for (
    const key
    of candidates
  ) {
    if (answers[key]) {
      return answers[key];
    }
  }

  return null;
}


function applyDerivedAnswers(
  questions,
  answerDocument
) {
  const stats = {
    mapFound:
      Boolean(answerDocument),

    applied: 0,
    suggested: 0,
    missing: 0
  };

  if (!answerDocument) {
    return stats;
  }

  const provenance = {
    kind:
      answerDocument
        ?.provenance
        ?.kind ||
      "ai-derived",

    model:
      answerDocument
        ?.provenance
        ?.model ||
      null,

    official:
      Boolean(
        answerDocument
          ?.provenance
          ?.official
      )
  };

  for (
    const question
    of questions
  ) {
    const entry =
      findDerivedAnswerEntry(
        answerDocument,
        question
      );

    if (!entry) {
      stats.missing++;
      continue;
    }

    const review = {
      source:
        provenance.kind,

      model:
        provenance.model,

      official:
        provenance.official,

      confidence:
        numberOrNull(
          entry.confidence
        ),

      status:
        entry.status ||
        "needsReview",

      reason:
        entry.reason ||
        null
    };

    // Do not overwrite an answer already embedded in the HTML.
    const htmlAlreadyAnswered =
      question
        ?.answer
        ?.mode &&
      question
        .answer
        .mode !==
      "manual";

    if (
      !htmlAlreadyAnswered &&
      entry.status === "ready" &&
      entry.answer
    ) {
      question.answer =
        entry.answer;

      question.answerReview =
        review;

      stats.applied++;
      continue;
    }

    if (
      entry.suggestedAnswer ||
      (
        entry.status !== "ready" &&
        entry.answer
      )
    ) {
      question.suggestedAnswer =
        entry.suggestedAnswer ||
        entry.answer;

      question.answerReview =
        review;

      stats.suggested++;
      continue;
    }

    if (htmlAlreadyAnswered) {
      question.answerReview = {
        ...review,
        status:
          "html-answer-preserved"
      };
    }
  }

  return stats;
}


// ==========================================================
// Number helper
// ==========================================================

function numberOrNull(
  value
) {
  const number =
    Number(
      value
    );

  return Number
    .isFinite(
      number
    )
      ? number
      : null;
}


// ==========================================================
// Boolean query helper
// ==========================================================

function booleanQuery(
  value,
  defaultValue = false
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return defaultValue;
  }


  return [
    "1",
    "true",
    "yes",
    "on"
  ]
    .includes(
      String(
        value
      )
        .toLowerCase()
    );
}


// ==========================================================
// Preview summary
// ==========================================================

function summarizeQuestions(
  questions
) {
  const bySection = {};
  const byType = {};

  let answered = 0;
  let manualAnswers = 0;
  let withImages = 0;


  for (
    const question
    of questions
  ) {
    bySection[
      question.section
    ] =
      (
        bySection[
          question.section
        ] || 0
      ) + 1;


    byType[
      question.type
    ] =
      (
        byType[
          question.type
        ] || 0
      ) + 1;


    if (
      question
        .answer
        .mode ===
      "manual"
    ) {
      manualAnswers++;
    }
    else {
      answered++;
    }


    if (
      question
        .imageSources
        .length
    ) {
      withImages++;
    }
  }


  return {
    bySection,
    byType,
    answered,
    manualAnswers,
    withImages
  };
}


// ==========================================================
// Main Azure Function
// ==========================================================

app.http(
  "importHtmlExam",
  {
    methods: [
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "import-html-exam",


    handler:
      async request => {
        try {

          // =================================================
          // Authentication (teacher/builder session required)
          // =================================================

          const auth =
            requireBuilderAuth(
              request
            );

          if (!auth.ok) {
            return auth.response;
          }


          // =================================================
          // Query parameters
          // =================================================

          const url =
            new URL(
              request.url
            );


          const examCode =
            String(
              url.searchParams.get(
                "examCode"
              ) || ""
            )
              .trim();


          const year =
            Number(
              url.searchParams.get(
                "year"
              )
            );


          const variant =
            String(
              url.searchParams.get(
                "variant"
              ) || ""
            )
              .trim();


          const suppliedSourceId =
            String(
              url.searchParams.get(
                "sourceId"
              ) || ""
            )
              .trim();


          const sourceId =
            suppliedSourceId ||
            buildSourceId(
              examCode,
              year,
              variant
            );


          const save =
            booleanQuery(
              url.searchParams.get(
                "save"
              ),
              false
            );


          const priority =
            numberOrNull(
              url.searchParams.get(
                "priority"
              )
            ) ?? 80;


          const sourceType =
            String(
              url.searchParams.get(
                "sourceType"
              ) ||
              "exam-html"
            )
              .trim();


          const season =
            String(
              url.searchParams.get(
                "season"
              ) ||
              "صيف"
            )
              .trim();


          const title =
            String(
              url.searchParams.get(
                "title"
              ) ||
              sourceId
            )
              .trim();


          // =================================================
          // Validate metadata
          // =================================================

          if (!examCode) {
            throw new Error(
              "examCode is required"
            );
          }


          if (
            !Number.isInteger(
              year
            ) ||
            year < 2000 ||
            year > 2100
          ) {
            throw new Error(
              "A valid year is required"
            );
          }


          if (!sourceId) {
            throw new Error(
              "sourceId could not be determined"
            );
          }


          // =================================================
          // Read HTML body
          // =================================================

          const html =
            await request.text();


          if (
            !html ||
            html.length < 100
          ) {
            throw new Error(
              "HTML body is empty or too small"
            );
          }


          // =================================================
          // Parse HTML
          // =================================================

          const root =
            parseHtml(
              html
            );


          const cards =
            findAll(
              root,
              node =>
                hasClass(
                  node,
                  "q-card"
                )
            );


          if (
            !cards.length
          ) {
            throw new Error(
              "No .q-card questions were found in the HTML"
            );
          }


          // =================================================
          // Extract answer definitions
          // =================================================

          const answerMap =
            buildAnswerMap(
              html
            );


          // =================================================
          // Extract questions
          // =================================================

          let extracted =
            cards.map(
              (
                card,
                index
              ) =>
                extractQuestion(
                  card,
                  index + 1,
                  answerMap
                )
            );


          extracted =
            ensureUniqueSourceQuestionIds(
              extracted
            );


          // =================================================
          // Optional answer enrichment
          // =================================================

          const derivedAnswerDocument =
            loadDerivedAnswerMap(
              sourceId
            );


          const derivedAnswerStats =
            applyDerivedAnswers(
              extracted,
              derivedAnswerDocument
            );


          // =================================================
          // Source hash
          // =================================================

          const sourceHash =
            crypto
              .createHash(
                "sha256"
              )
              .update(
                html,
                "utf8"
              )
              .digest(
                "hex"
              );


          // =================================================
          // Summary
          // =================================================

          const summary =
            summarizeQuestions(
              extracted
            );


          const now =
            new Date()
              .toISOString();


          // =================================================
          // Storage
          //
          // Preview mode must not require or touch Blob Storage.
          // =================================================

          let rawContainer =
            null;

          let bankContainer =
            null;

          let assetsContainer =
            null;


          if (save) {
            const connectionString =
              process.env
                .AZURE_STORAGE_CONNECTION_STRING;


            if (
              !connectionString
            ) {
              throw new Error(
                "AZURE_STORAGE_CONNECTION_STRING is not configured"
              );
            }


            const blobServiceClient =
              BlobServiceClient
                .fromConnectionString(
                  connectionString
                );


            rawContainer =
              blobServiceClient
                .getContainerClient(
                  RAW_CONTAINER
                );


            bankContainer =
              blobServiceClient
                .getContainerClient(
                  BANK_CONTAINER
                );


            assetsContainer =
              blobServiceClient
                .getContainerClient(
                  ASSETS_CONTAINER
                );
          }


          // =================================================
          // Embedded images
          // =================================================

          const assetLookup =
            new Map();


          const uniqueImages =
            new Map();


          for (
            const question
            of extracted
          ) {
            for (
              const source
              of question
                .imageSources
            ) {
              const decoded =
                decodeDataImage(
                  source
                );


              // External images are not uploaded here.
              // The HTML exams supplied so far use base64 images.
              if (!decoded) {
                continue;
              }


              const hash =
                crypto
                  .createHash(
                    "sha256"
                  )
                  .update(
                    decoded.buffer
                  )
                  .digest(
                    "hex"
                  );


              if (
                !uniqueImages.has(
                  hash
                )
              ) {
                uniqueImages.set(
                  hash,
                  decoded
                );
              }
            }
          }


          // =================================================
          // Save containers/assets
          // =================================================

          if (save) {
            await Promise.all([
              rawContainer
                .createIfNotExists(),

              bankContainer
                .createIfNotExists(),

              assetsContainer
                .createIfNotExists()
            ]);


            for (
              const [
                hash,
                decoded
              ]
              of uniqueImages.entries()
            ) {
              const blobName =
                `${examCode}/${year}/${variant || "main"}/${hash.slice(
                  0,
                  20
                )}${decoded.extension}`;


              const blockBlobClient =
                assetsContainer
                  .getBlockBlobClient(
                    blobName
                  );


              await blockBlobClient
                .uploadData(
                  decoded.buffer,
                  {
                    blobHTTPHeaders: {
                      blobContentType:
                        decoded
                          .contentType
                    }
                  }
                );


              assetLookup.set(
                hash,
                {
                  id:
                    `${sourceId}-img-${hash.slice(
                      0,
                      16
                    )}`,

                  key:
                    hash.slice(
                      0,
                      16
                    ),

                  container:
                    ASSETS_CONTAINER,

                  blobName,

                  contentType:
                    decoded
                      .contentType,

                  sizeBytes:
                    decoded
                      .buffer
                      .length
                }
              );
            }
          }


          // =================================================
          // Convert extracted questions to bank schema
          // =================================================

          const questions =
            extracted.map(
              question => {

                const assets = [];

                const seen =
                  new Set();


                for (
                  const source
                  of question
                    .imageSources
                ) {
                  const decoded =
                    decodeDataImage(
                      source
                    );


                  if (!decoded) {
                    continue;
                  }


                  const hash =
                    crypto
                      .createHash(
                        "sha256"
                      )
                      .update(
                        decoded.buffer
                      )
                      .digest(
                        "hex"
                      );


                  if (
                    seen.has(
                      hash
                    )
                  ) {
                    continue;
                  }


                  seen.add(
                    hash
                  );


                  if (
                    save &&
                    assetLookup.has(
                      hash
                    )
                  ) {
                    assets.push(
                      assetLookup.get(
                        hash
                      )
                    );
                  }
                  else {
                    assets.push({
                      id:
                        `${sourceId}-img-${hash.slice(
                          0,
                          16
                        )}`,

                      key:
                        hash.slice(
                          0,
                          16
                        ),

                      previewOnly:
                        true,

                      contentType:
                        decoded
                          .contentType,

                      sizeBytes:
                        decoded
                          .buffer
                          .length
                    });
                  }
                }


                return {

                  // ------------------------------------------
                  // Identity
                  // ------------------------------------------

                  id:
                    `${sourceId}-${question.sourceQuestionId}`,

                  sourceId,

                  sourceQuestionId:
                    question
                      .sourceQuestionId,

                  questionNumber:
                    question
                      .questionNumber,


                  // ------------------------------------------
                  // Structure
                  // ------------------------------------------

                  section:
                    question.section,

                  originalSection:
                    question
                      .originalSection,

                  parentGroup:
                    null,

                  points:
                    question.points,


                  // ------------------------------------------
                  // Content
                  // ------------------------------------------

                  type:
                    question.type,

                  originalType:
                    question
                      .originalType,

                  text:
                    question.text,

                  textHtml:
                    question
                      .textHtml,

                  options:
                    question.options,

                  fields:
                    question.fields,

                  parts:
                    question.parts,

                  answer:
                    question.answer,

                  suggestedAnswer:
                    question
                      .suggestedAnswer ||
                    null,

                  answerReview:
                    question
                      .answerReview ||
                    null,

                  hint:
                    question.hint,

                  assets,


                  // ------------------------------------------
                  // Flags
                  // ------------------------------------------

                  flags: {
                    hasImage:
                      assets.length >
                      0,

                    hasOptions:
                      question
                        .options
                        .length >
                      0,

                    isChild:
                      false,

                    requiresManualReview:
                      question
                        .answer
                        .mode ===
                      "manual" ||
                      question
                        ?.answerReview
                        ?.status ===
                      "needsReview"
                  },


                  // ------------------------------------------
                  // Classification
                  // ------------------------------------------

                  classification: {
                    topic:
                      null,

                    secondaryTopics:
                      [],

                    difficulty:
                      null,

                    difficultyLabel:
                      null,

                    difficultyReason:
                      null,

                    difficultyConfidence:
                      null,

                    familyKey:
                      null,

                    status:
                      "pending"
                  },


                  reviewStatus:
                    question
                      ?.answerReview
                      ?.status ===
                    "needsReview"
                      ? "pending-answer-review"
                      : "pending-classification"
                };
              }
            );


          // =================================================
          // Destination blob names
          // =================================================

          const rawBlobName =
            `html/${sourceId}.html`;


          const sourceBlobName =
            `sources/${sourceId}.json`;


          // =================================================
          // Save to bank
          // =================================================

          if (save) {

            // ------------------------------------------------
            // Original HTML
            // ------------------------------------------------

            await uploadText(
              rawContainer,
              rawBlobName,
              html,
              "text/html; charset=utf-8"
            );


            // ------------------------------------------------
            // Source document
            // ------------------------------------------------

            const bankDocument = {
              schemaVersion:
                1,

              source: {
                id:
                  sourceId,

                examCode,

                year,

                variant:
                  variant ||
                  null,

                season,

                title,

                sourceType,

                provenance:
                  "uploaded-html",

                priority,

                original: {
                  container:
                    RAW_CONTAINER,

                  blobName:
                    rawBlobName,

                  sha256:
                    sourceHash
                },

                processedAt:
                  now,

                answerEnrichment:
                  derivedAnswerStats
              },


              groups: [],


              questionCount:
                questions.length,


              imageCount:
                uniqueImages.size,


              questions
            };


            await uploadJson(
              bankContainer,
              sourceBlobName,
              bankDocument
            );


            // =================================================
            // Update global question index
            // =================================================

            const existingIndex =
              await readExistingIndex(
                bankContainer
              );


            const oldQuestions =
              Array.isArray(
                existingIndex
                  .questions
              )
                ? existingIndex
                    .questions
                : [];


            // Replace old entries only for same source.
            const otherSources =
              oldQuestions.filter(
                question =>
                  question
                    .sourceId !==
                  sourceId
              );


            const sourceIndexEntries =
              questions.map(
                question => ({
                  id:
                    question.id,

                  sourceId,

                  year,

                  examCode,

                  variant:
                    variant ||
                    null,

                  sourcePriority:
                    priority,

                  questionNumber:
                    question
                      .questionNumber,

                  section:
                    question
                      .section,

                  originalSection:
                    question
                      .originalSection,

                  type:
                    question
                      .type,

                  originalType:
                    question
                      .originalType,


                  // ------------------------------------------
                  // Classification starts empty.
                  // ------------------------------------------

                  topic:
                    null,

                  secondaryTopics:
                    [],

                  difficulty:
                    null,

                  difficultyLabel:
                    null,

                  familyKey:
                    null,


                  // ------------------------------------------
                  // Other searchable fields
                  // ------------------------------------------

                  hasImage:
                    question
                      .flags
                      .hasImage,

                  assetCount:
                    question
                      .assets
                      .length,

                  hasCLI:
                    false,

                  requiresCalculation:
                    false,

                  needsReview:
                    question
                      .flags
                      .requiresManualReview,

                  reviewStatus:
                    question
                      .reviewStatus,

                  classificationConfidence:
                    null,

                  answerSource:
                    question
                      ?.answerReview
                      ?.source ||
                    null,

                  answerConfidence:
                    question
                      ?.answerReview
                      ?.confidence ??
                    null,

                  answerReviewStatus:
                    question
                      ?.answerReview
                      ?.status ||
                    null
                })
              );


            const finalQuestions = [
              ...otherSources,
              ...sourceIndexEntries
            ];


            const finalIndex = {
              schemaVersion:
                1,

              updatedAt:
                now,

              questionCount:
                finalQuestions.length,

              questions:
                finalQuestions
            };


            await uploadJson(
              bankContainer,
              INDEX_BLOB,
              finalIndex
            );
          }


          // =================================================
          // Result
          // =================================================

          return {
            status: 200,

            jsonBody: {
              ok:
                true,

              previewOnly:
                !save,

              savedToBank:
                save,


              source: {
                sourceId,

                examCode,

                year,

                variant:
                  variant ||
                  null,

                title,

                sha256:
                  sourceHash
              },


              questions: {
                total:
                  questions.length,

                ...summary,

                manualAnswerQuestionIds:
                  questions
                    .filter(
                      question =>
                        question
                          .answer
                          .mode ===
                        "manual"
                    )
                    .map(
                      question =>
                        question.id
                    )
              },


              answerEnrichment:
                derivedAnswerStats,


              assets: {
                uniqueEmbeddedImages:
                  uniqueImages.size,

                uploaded:
                  save
                    ? uniqueImages
                        .size
                    : 0
              },


              bank:
                save
                  ? {
                      sourceBlob:
                        sourceBlobName,

                      indexBlob:
                        INDEX_BLOB,

                      rawBlob:
                        rawBlobName
                    }
                  : null,


              message:
                save
                  ? "HTML exam imported into the bank."
                  : "HTML exam preview completed; nothing was saved."
            }
          };
        }


        catch {
          return {
            status: 500,

            jsonBody: {
              ok:
                false,

              error: "تعذر استيراد ملف HTML حاليًا."
            }
          };
        }
      }
  }
);