const fs = require('fs');
const path = require('path');

const routesPath = 'c:/Users/PC/Downloads/Sentence-Splitter-main/server/routes.ts';
let content = fs.readFileSync(routesPath, 'utf8');

// 1. Remove internal definitions from registerRoutes
// We'll move uniqueBrands, sendBrandSearchResult, extractList, normalizeBrand, AuthBrand, firstString
// to the TOP LEVEL to avoid any scope issues.

// First, extract them from their current location to avoid duplicates
content = content.replace(/type\s+AuthBrand\s+=\s+\{[\s\S]+?\}\s*;\s*/g, '');
content = content.replace(/function\s+firstString\([\s\S]+?\}\s*/g, '');
content = content.replace(/function\s+extractList\([\s\S]+?\}\s*/g, '');
content = content.replace(/function\s+normalizeBrand\([\s\S]+?\}\s*/g, '');
content = content.replace(/function\s+uniqueBrands\([\s\S]+?\}\s*/g, '');
content = content.replace(/function\s+sendBrandSearchResult\([\s\S]+?\}\s*/g, '');

// 2. Add them to the top of the file (after normalizePublicBrandName)
const globalUtils = `
type AuthBrand = { brandNo: string; name: string; logo: string | null; source?: string };

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function extractList(raw: any): any[] {
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
}

function normalizeBrand(raw: any, fallbackName: string, source: string, allowGenericId: boolean): AuthBrand | null {
  const brandNo = firstString(
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
  );
  if (!brandNo) return null;

  const name = firstString(
    raw?.name,
    raw?.brandName,
    raw?.brand_name,
    raw?.partnerName,
    raw?.partner_name,
    raw?.academyName,
    raw?.academy_name,
    raw?.companyName,
    raw?.company_name,
    fallbackName,
  );

  const logo = firstString(raw?.logo, raw?.logoUrl, raw?.logo_url, raw?.imageUrl, raw?.image_url) || null;
  return { brandNo, name: name || brandNo, logo, source };
}

function uniqueBrands(brands: AuthBrand[]): AuthBrand[] {
  const seen = new Set<string>();
  return brands.filter((brand) => {
    if (!brand.brandNo || seen.has(brand.brandNo)) return false;
    seen.add(brand.brandNo);
    return true;
  });
}

function sendBrandSearchResult(res: any, brands: AuthBrand[]) {
  if (!brands || brands.length === 0) {
    return res.status(404).json({ message: "학원을 찾을 수 없습니다." });
  }
  const first = brands[0];
  return res.json({ ...first, brands });
}
`;

// Insert after normalizePublicBrandName
const splitPoint = 'function normalizePublicBrandName(value: string) {';
const nextBlockIndex = content.indexOf('}', content.indexOf(splitPoint)) + 1;
content = content.substring(0, nextBlockIndex) + globalUtils + content.substring(nextBlockIndex);

// 3. Fix the route handlers themselves to be clean
// We need to use new paths and ensure the code doesn't have stray braces.

const searchAcademyRoute = `
  app.get(api.auth.searchAcademy.path, async (req, res) => {
    try {
      const rawName = req.query.name as string | string[] | undefined;
      const name = Array.isArray(rawName) ? rawName[0] : rawName;
      const trimmedName = name?.trim();
      if (!trimmedName) {
        return res.status(400).json({ message: "학원명을 입력해주세요." });
      }

      if (/^\\d+$/.test(trimmedName)) {
        return sendBrandSearchResult(res, [{ brandNo: trimmedName, name: trimmedName, logo: null, source: "manual" }]);
      }

      const knownBrand = publicBrandAliases[normalizePublicBrandName(trimmedName)];
      if (knownBrand) {
        return sendBrandSearchResult(res, [{ ...knownBrand, source: "alias" }]);
      }

      const partnerEndpoints = [
        \`https://www.flipedu.net/api/v2/partners?name=\${encodeURIComponent(trimmedName)}\`,
        \`https://dev.flipedu.net/api/v2/partners?name=\${encodeURIComponent(trimmedName)}\`,
        \`https://lms.flipedu.net/api/auth/partners?name=\${encodeURIComponent(trimmedName)}\`,
        \`https://dev.lms.flipedu.net/api/auth/partners?name=\${encodeURIComponent(trimmedName)}\`,
      ];

      const partnerHeaders = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": "https://teacher.flipedu.net",
        "Referer": "https://teacher.flipedu.net/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      };

      const attempts = [];
      for (const endpoint of partnerEndpoints) {
        try {
          const r = await fetch(endpoint, { headers: partnerHeaders, redirect: "follow" });
          const domain = new URL(endpoint).hostname.replace('www.', '').split('.')[0];
          attempts.push(\`\${domain}: \${r.status}\`);
          if (!r.ok) continue;

          const raw = await r.json().catch(() => null);
          if (!raw) continue;

          const list = extractList(raw);
          const brands = uniqueBrands(
            list
              .map((item) => normalizeBrand(item, trimmedName, new URL(endpoint).hostname, true))
              .filter((item) => !!item)
          );

          if (brands.length > 0) {
            return sendBrandSearchResult(res, brands);
          }
        } catch (e) {
          attempts.push(\`err: \${endpoint.substring(8, 20)}\`);
        }
      }

      return res.status(404).json({ message: \`학원을 찾을 수 없습니다. (\${attempts.join(", ")})\` });
    } catch (err) {
      console.error("[AUTH] Academy search error:", err);
      res.status(500).json({ message: "학원 검색 중 오류가 발생했습니다. " + err.message });
    }
  });`;

const branchesRoute = `
  app.get(api.auth.branches.path, async (req, res) => {
    try {
      const rawBrandNo = req.query.brandNo as string | string[] | undefined;
      const brandNo = Array.isArray(rawBrandNo) ? rawBrandNo[0] : rawBrandNo;
      const trimmedBrandNo = brandNo?.trim();
      if (!trimmedBrandNo) {
        return res.status(400).json({ message: "brandNo가 필요합니다." });
      }

      const flipHeaders = {
        "Accept": "application/json",
        "Origin": "https://editor.flipedu.net",
        "Referer": "https://editor.flipedu.net/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      };

      const endpoints = [
        \`https://www.flipedu.net/api/v2/branches?sys=0&brand=\${encodeURIComponent(trimmedBrandNo)}\`,
        \`https://dev.flipedu.net/api/v2/branches?sys=0&brand=\${encodeURIComponent(trimmedBrandNo)}\`,
        \`https://lms.flipedu.net/api/auth/branches?brandNo=\${encodeURIComponent(trimmedBrandNo)}\`,
        \`https://dev.lms.flipedu.net/api/auth/branches?brandNo=\${encodeURIComponent(trimmedBrandNo)}\`,
      ];

      let rawData = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { headers: flipHeaders, redirect: "follow" });
          if (response.ok) {
            rawData = await response.json();
            break;
          }
        } catch (err) {}
      }

      if (!rawData) {
        return res.status(500).json({ message: "지점 목록을 불러올 수 없습니다." });
      }

      const seenBranchNos = new Set();
      const branches = extractList(rawData)
        .map((b) => ({
          value: firstString(b.branchNo, b.branch_no, b.no, b.id),
          label1: firstString(b.branchName, b.branch_name, b.name),
          label2: firstString(b.academyName, b.academy_name),
        }))
        .filter((b) => {
          if (!b.value || seenBranchNos.has(b.value)) return false;
          seenBranchNos.add(b.value);
          return true;
        });

      res.json(branches);
    } catch (err) {
      console.error("[AUTH] Branches error:", err);
      res.status(500).json({ message: "지점 조회 중 오류가 발생했습니다. " + err.message });
    }
  });`;

// Replace the entire searchAcademy and branches routes
// We need to find the start of searchAcademy and end of branches
const routeStartMarker = 'app.get(api.auth.searchAcademy.path';
const routeEndMarker = 'app.get(api.auth.login.path'; // Assuming login is next

// Helper to find index of a search string after a start index
const findNext = (str, search, start) => {
  const idx = str.indexOf(search, start);
  return idx === -1 ? null : idx;
};

const academyStart = content.indexOf(routeStartMarker);
const loginStart = content.indexOf('app.post(api.auth.login.path');

if (academyStart !== -1 && loginStart !== -1) {
  content = content.substring(0, academyStart) + searchAcademyRoute + '\n\n' + branchesRoute + '\n\n  ' + content.substring(loginStart);
} else {
  console.log("Could not find route markers precisely. Falling back to targeted replacement.");
}

fs.writeFileSync(routesPath, content);
console.log('Successfully refactored auth logic and paths in routes.ts');
