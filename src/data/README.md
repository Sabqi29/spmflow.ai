# Malaysian secondary-school suggestions

`malaysia-secondary-schools.json` contains 2,436 secondary-school records extracted from both parts of Wikipedia Bahasa Melayu's *Senarai sekolah menengah di Malaysia*. It includes coded table rows plus schools listed separately under categories such as SBP, MRSM, religious, technical, vocational, and private schools:

- https://ms.wikipedia.org/wiki/Senarai_sekolah_menengah_di_Malaysia/1
- https://ms.wikipedia.org/wiki/Senarai_sekolah_menengah_di_Malaysia/2

The source is community-maintained and is not guaranteed to be complete or current. The signup field therefore uses these records only as search suggestions and always allows manual entry.

Regenerate the file with:

```powershell
node scripts/build-school-list.mjs <part-1-api-response.json> <part-2-api-response.json>
```
