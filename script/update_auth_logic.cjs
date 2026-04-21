const fs = require('fs');
const path = require('path');

const routesPath = 'c:/Users/PC/Downloads/Sentence-Splitter-main/server/routes.ts';
let content = fs.readFileSync(routesPath, 'utf8');

// Use regex to be whitespace/newline insensitive
function replaceRegex(content, regex, replacement) {
  if (!regex.test(content)) {
    console.log(`Could not match regex: ${regex.toString().substring(0, 100)}...`);
    return content;
  }
  return content.replace(regex, replacement);
}

// 1. Update extractList
// Matches function extractList(raw: any): any[] { ... return raw ? [raw] : []; }
const extractListRegex = /function\s+extractList\(raw:\s+any\):\s+any\[\]\s+\{[\s\S]+?return\s+raw\s+\?\s+\[raw\]\s+:\s+\[\];\s+\}/;
const newExtractList = `function extractList(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    
    // Check common wrappers
    const roots = [raw.data, raw.contents, raw.content, raw].filter(Boolean);
    for (const root of roots) {
      if (typeof root !== "object") continue;
      if (Array.isArray(root)) return root;
      for (const key of ["elements", "items", "results", "list", "rows", "partners", "branches", "content"]) {
        if (Array.isArray(root[key])) return root[key];
      }
    }
    
    // If no list found, maybe it's a single object that looks like a brand/branch
    if (raw && (raw.brandNo || raw.brand || raw.partnerNo || raw.id || raw.branchNo)) {
      return [raw];
    }
    
    return [];
  }`;

content = replaceRegex(content, extractListRegex, newExtractList);

// 2. Update normalizeBrand brandNo logic
const brandNoRegex = /const\s+brandNo\s+=\s+firstString\([\s\S]+?allowGenericId\s+\?\s+raw\?\.no\s+:\s+undefined,?\s+\);/;
const newBrandNo = `const brandNo = firstString(
      raw?.brandNo,
      raw?.brand_no,
      raw?.brand,
      raw?.brandId,
      raw?.brand_id,
      raw?.brandSeq,
      raw?.brand_seq,
      raw?.partnerNo,
      raw?.partner_no,
      raw?.partnerId,
      raw?.partner_id,
      allowGenericId ? raw?.id : undefined,
      allowGenericId ? raw?.no : undefined,
      allowGenericId ? raw?.partner_no : undefined,
    );`;

content = replaceRegex(content, brandNoRegex, newBrandNo);

// 3. Update searchAcademy logging
const searchLoopRegex = /const\s+r\s+=\s+await\s+fetch\(endpoint,\s+\{\s+headers:\s+partnerHeaders,\s+redirect:\s+"follow"\s+\}\);[\s\S]+?return\s+sendBrandSearchResult\(res,\s+brands\);\s+\}/;
const newSearchLoop = `const r = await fetch(endpoint, { headers: partnerHeaders, redirect: "follow" });
          const domain = new URL(endpoint).hostname.replace('www.', '').split('.')[0];
          attempts.push(\`\${domain}: \${r.status}\`);
          console.log(\`[AUTH] Academy search partners \${endpoint}: \${r.status}\`);
          if (!r.ok) continue;

          const raw = await r.json().catch(() => null);
          if (!raw) {
            console.log(\`[AUTH] Academy search \${endpoint} returned empty or invalid JSON\`);
            continue;
          }

          // In-depth debugging for response structure
          const list = extractList(raw);
          console.log(\`[AUTH] Academy search \${endpoint} - extracted \${list.length} items. Raw sample:\`, JSON.stringify(raw).substring(0, 300));

          const brands = uniqueBrands(
            list
              .map((item) => normalizeBrand(item, trimmedName || "", new URL(endpoint).hostname, true))
              .filter((item): item is AuthBrand => Boolean(item)),
          );

          if (brands.length > 0) {
            console.log(\`[AUTH] Academy search SUCCESS (\${domain}): \${brands.map((brand) => \`\${brand.name}#\${brand.brandNo}\`).join(", ")}\`);
            return sendBrandSearchResult(res, brands);
          } else if (list.length > 0) {
            console.log(\`[AUTH] Academy search candidates failed normalization for \${list.length} items from \${domain}\`);
          }`;

content = replaceRegex(content, searchLoopRegex, newSearchLoop);

// 4. Update branches logging
const branchLoopRegex = /if\s+\(response\.ok\)\s+\{[\s\S]+?rawData\s+=\s+await\s+response\.json\(\);[\s\S]+?console\.log\(`\[AUTH\]\s+Branches\s+success:`,[\s\S]+?JSON\.stringify\(rawData\)\.substring\(0,\s+300\)\);[\s\S]+?break;\s+\}/;
const newBranchLoop = `if (response.ok) {
            rawData = await response.json();
            console.log(\`[AUTH] Branches success (\${endpoint}): extracted \${extractList(rawData).length} items. Body sample:\`, JSON.stringify(rawData).substring(0, 300));
            break;
          }`;

content = replaceRegex(content, branchLoopRegex, newBranchLoop);

fs.writeFileSync(routesPath, content);
console.log('Successfully updated auth logic in routes.ts with Regex strategy');
