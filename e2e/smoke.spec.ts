import {expect,test} from '@playwright/test';

// Guest-only flows, so the suite needs no accounts and stores nothing (it does not call the AI tutor, to spare quota).

test('landing shows the brand and hero',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('img',{name:'spmflow'}).first()).toBeVisible();
 await expect(page.locator('h1.retro')).toBeVisible();
});

test('study space opens the Form 4 textbook',async({page})=>{
 await page.goto('/belajar');
 await expect(page.locator('.rack-book.on')).toContainText(/4/);
 await expect(page.getByText('Buku teks belum dapat dibuka.')).toHaveCount(0,{timeout:30_000});
 await expect(page.locator('.textbook-pane canvas:visible, .textbook-pane img:visible').first()).toBeVisible({timeout:30_000});
});

test('guest practice loads questions from the database and grades on the server',async({page})=>{
 await page.goto('/latihan/2024_kedah_1');
 await page.locator('.locked-start button.button').click();
 const choices=page.locator('.locked-options button');
 await expect(choices).toHaveCount(4);
 await choices.first().click();
 page.on('dialog',dialog=>dialog.accept());
 const nav=page.locator('.question-nav button');
 const total=await nav.count();
 await nav.last().click();
 await page.getByRole('button',{name:/Hantar jawapan|Submit answers/}).click();
 await expect(page.locator('.locked-results h1')).toContainText('/');
 await expect(page.locator('.answer-review article')).toHaveCount(total);
 await expect(page.locator('.review-options li.is-answer').first()).toBeVisible();
});

test('answer key is not readable through the public API',async({request})=>{
 test.skip(!process.env.E2E_SUPABASE_URL||!process.env.E2E_SUPABASE_KEY,'set E2E_SUPABASE_URL and E2E_SUPABASE_KEY (publishable key) to run');
 const response=await request.get(`${process.env.E2E_SUPABASE_URL}/rest/v1/questions?select=answer&limit=1`,{headers:{apikey:process.env.E2E_SUPABASE_KEY!}});
 expect(response.status()).toBeGreaterThanOrEqual(400);
});
