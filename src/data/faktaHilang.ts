/* Fakta Hilang puzzles. Every fact comes from the Sejarah KSSM textbooks (Tingkatan 4 and 5);
   `page` is the printed page number where the fact appears. `text` holds one blank written as ___.
   `answers[0]` is the answer shown to students; any other entry is also accepted.
   The daily order alternates Tingkatan 4 and 5. Append new puzzles at the end of a list so past
   days keep their puzzle. */
export type FactPuzzle={id:string;form:4|5;chapter:number;page:number;text:string;answers:string[];clue:string;note?:string};

const T4:FactPuzzle[]=[
 {id:'t4-kota-bharu',form:4,chapter:3,page:69,text:'Serangan Jepun di Tanah Melayu bermula pada 8 Disember 1941 dengan pendaratan di Pantai Kuala Pak Amat, ___, Kelantan.',answers:['Kota Bharu','Kota Baru','Kota Baharu'],clue:'Ibu negeri Kelantan.'},
 {id:'t4-umno-1946',form:4,chapter:4,page:105,text:'UMNO ditubuhkan dalam Kongres Melayu di Istana Besar, Johor Bahru pada 11 Mei ___.',answers:['1946'],clue:'Tahun yang sama Malayan Union diisytiharkan.'},
 {id:'t4-baling',form:4,chapter:6,page:160,text:'Tunku Abdul Rahman bertemu pemimpin PKM di Sekolah Inggeris, ___, Kedah pada 28 Disember 1955.',answers:['Baling'],clue:'Rundingan ini dinamakan sempena tempat pertemuan itu.',note:'Rundingan Baling gagal kerana PKM enggan membubarkan parti dan menyerah diri.'},
 {id:'t4-hukum-laut',form:4,chapter:1,page:7,text:'Kesultanan Melayu Melaka mempunyai dua undang-undang bertulis, iaitu Hukum Kanun Melaka dan Undang-Undang ___ Melaka.',answers:['Laut'],clue:'Undang-undang ini berkaitan dengan pelayaran dan urusan di kapal.'},
 {id:'t4-macmichael',form:4,chapter:4,page:98,text:'British melantik Sir Harold ___ untuk mendapatkan tandatangan sultan bagi menubuhkan Malayan Union.',answers:['MacMichael','Mac Michael'],clue:'Nama keluarganya bermula dengan "Mac".'},
 {id:'t4-hiroshima',form:4,chapter:3,page:82,text:'Pada 6 Ogos 1945, bom atom "Little Boy" dijatuhkan ke atas bandar ___.',answers:['Hiroshima'],clue:'Bandar di Jepun. Tiga hari kemudian, Nagasaki pula dibom.'},
 {id:'t4-hartal',form:4,chapter:5,page:131,text:'Hari ___ Se-Malaya pada 20 Oktober 1947 ialah tindakan menutup kedai dan menghentikan semua kegiatan ekonomi.',answers:['Hartal'],clue:'Dianjurkan oleh PUTERA-AMCJA untuk membantah cadangan Persekutuan.'},
 {id:'t4-mckk-1905',form:4,chapter:2,page:37,text:'Maktab Melayu Kuala Kangsar (MCKK) yang ditubuhkan pada tahun ___ melahirkan golongan intelektual berpendidikan Inggeris.',answers:['1905'],clue:'Awal abad ke-20.'},
 {id:'t4-sungai-siput',form:4,chapter:6,page:148,text:'Pada 16 Jun 1948, komunis membunuh tiga orang pengurus ladang Eropah di ___, Perak.',answers:['Sungai Siput','Sg Siput'],clue:'Peristiwa ini membawa kepada pengisytiharan darurat.'},
 {id:'t4-reid',form:4,chapter:9,page:220,text:'Pada 8 Mac 1956, British mengumumkan pembentukan Suruhanjaya Perlembagaan Persekutuan Tanah Melayu atau Suruhanjaya ___.',answers:['Reid'],clue:'Dinamakan sempena pengerusinya, seorang Lord dari Britain.'},
 {id:'t4-palembang',form:4,chapter:1,page:4,text:'Kerajaan Srivijaya yang berpusat di ___ meneruskan ciri-ciri negara bangsa kerajaan Funan dan Champa.',answers:['Palembang'],clue:'Sebuah bandar di Sumatera.'},
 {id:'t4-april-1946',form:4,chapter:4,page:100,text:'Kerajaan British mengisytiharkan Malayan Union pada 1 ___ 1946.',answers:['April'],clue:'Bulan keempat.'},
 {id:'t4-mpaja',form:4,chapter:3,page:75,text:'Pasukan gerila ___ ditubuhkan selepas PKM bersetuju bekerjasama dengan British untuk menentang tentera Jepun.',answers:['MPAJA','Malayan Peoples Anti-Japanese Army'],clue:'Singkatan lima huruf bagi nama Inggeris pasukan ini.'},
 {id:'t4-sistem-ahli',form:4,chapter:7,page:178,text:'Sistem ___ dilaksanakan dari April 1951 hingga Jun 1955 sebelum pilihan raya Majlis Perundangan Persekutuan.',answers:['Ahli'],clue:'Pemimpin tempatan dilantik mengetuai jabatan seperti seorang menteri.'},
 {id:'t4-fraser',form:4,chapter:6,page:150,text:'Pada 6 Oktober 1951, Sir Henry Gurney terbunuh dalam serang hendap komunis dalam perjalanan ke Bukit ___.',answers:['Fraser'],clue:'Sebuah tanah tinggi di Pahang.'},
 {id:'t4-kms-1926',form:4,chapter:2,page:40,text:'Persatuan awal yang muncul ialah Kesatuan Melayu Singapura (KMS) yang ditubuhkan pada tahun ___.',answers:['1926'],clue:'Sebelas tahun sebelum KMM ditubuhkan.'},
 {id:'t4-februari-1948',form:4,chapter:5,page:132,text:'Persekutuan Tanah Melayu ditubuhkan secara rasmi pada 1 ___ 1948.',answers:['Februari'],clue:'Bulan kedua.'},
 {id:'t4-templer',form:4,chapter:6,page:159,text:'Pada tahun 1952, Sir Gerald ___ dilantik menjadi Pesuruhjaya Tinggi British di Tanah Melayu.',answers:['Templer'],clue:'Beliau terkenal dengan usaha "memenangi hati dan fikiran" rakyat.'},
 {id:'t4-imp',form:4,chapter:7,page:173,text:'Dato\' Onn Jaafar mengasaskan parti ___ untuk melaksanakan idea "Tanah Melayu untuk Malayan".',answers:['IMP','Independence of Malaya Party','Independence of Malayan Party'],clue:'Singkatan tiga huruf daripada nama Inggeris parti ini.'},
 {id:'t4-revolusi-1789',form:4,chapter:2,page:25,text:'Revolusi Perancis yang memperjuangkan kebebasan, persamaan dan persaudaraan tercetus pada tahun ___.',answers:['1789'],clue:'Akhir abad ke-18.'},
 {id:'t4-kampung-baru',form:4,chapter:4,page:105,text:'Kongres Melayu diadakan di Bangunan Kelab Sultan Sulaiman, Kampung ___, Kuala Lumpur.',answers:['Baru','Baharu'],clue:'Lawan kepada "lama".'},
 {id:'t4-fahim',form:4,chapter:9,page:218,text:'Tarikh kemerdekaan 31 Ogos 1957 ditetapkan setelah Tunku meminta pandangan Sheikh Abdullah ___, ulama dari Kepala Batas.',answers:['Fahim'],clue:'Nama ini berasal daripada perkataan Arab yang bermaksud "faham".'},
 {id:'t4-putera',form:4,chapter:5,page:128,text:'Golongan bukan Melayu menubuhkan AMCJA, yang kemudiannya bergabung dengan ___.',answers:['PUTERA','Pusat Tenaga Rakyat'],clue:'Singkatan bagi Pusat Tenaga Rakyat.'},
 {id:'t4-kempeitai',form:4,chapter:3,page:73,text:'Pasukan polis tentera Jepun, ___, menangkap dan menyeksa penduduk yang difitnah menentang Jepun.',answers:['Kempeitai','Kempetai'],clue:'Nama dalam bahasa Jepun.'},
 {id:'t4-briggs',form:4,chapter:6,page:157,text:'Rancangan ___ dilancarkan oleh Sir Henry Gurney pada tahun 1950 untuk menangani ancaman komunis.',answers:['Briggs'],clue:'Dinamakan sempena Pengarah Operasi yang merancangnya.'},
 {id:'t4-kmm-ibrahim',form:4,chapter:2,page:40,text:'Kesatuan Melayu Muda (KMM) ditubuhkan pada Mei 1937 hasil daripada gagasan Ibrahim Haji ___.',answers:['Yaakob','Yaacob','Yaakub'],clue:'Beliau ditangkap British pada tahun 1941.'},
 {id:'t4-selangor-padang',form:4,chapter:10,page:238,text:'Sambutan kemerdekaan bermula pada malam 30 Ogos 1957 di Padang Kelab ___.',answers:['Selangor'],clue:'Kini dikenali sebagai Dataran Merdeka.'},
 {id:'t4-mca-1949',form:4,chapter:6,page:161,text:'Tan Cheng Lock menubuhkan Malayan Chinese Association (MCA) di Kuala Lumpur pada 27 Februari ___.',answers:['1949'],clue:'Setahun selepas darurat diisytiharkan.'},
 {id:'t4-singapura-1942',form:4,chapter:3,page:69,text:'Keseluruhan Tanah Melayu jatuh ke tangan Jepun apabila ___ ditawan pada 15 Februari 1942.',answers:['Singapura','Singapore'],clue:'Pangkalan tentera British yang dianggap paling kuat di rantau ini.'},
 {id:'t4-pru-1952',form:4,chapter:8,page:196,text:'Pilihan Raya Majlis Perbandaran Kuala Lumpur diadakan pada Februari ___.',answers:['1952'],clue:'Kerjasama UMNO-MCA bermula dalam pilihan raya ini.'},
 {id:'t4-rashid-maidin',form:4,chapter:6,page:160,text:'Dalam Rundingan Baling, PKM diwakili oleh Chin Peng, Chen Tien dan ___.',answers:['Rashid Maidin','Abdul Rashid Maidin'],clue:'Seorang pemimpin PKM berbangsa Melayu.'},
 {id:'t4-stadium-merdeka',form:4,chapter:10,page:240,text:'Pada pagi 31 Ogos 1957, upacara kemerdekaan diadakan dengan gemilang di Stadium ___, Kuala Lumpur.',answers:['Merdeka'],clue:'Stadium ini dinamakan sempena peristiwa itu sendiri.'},
 {id:'t4-funan',form:4,chapter:1,page:4,text:'Kerajaan ___ mempunyai wilayah pengaruh yang luas dari Sungai Mekong hingga ke Segenting Kra.',answers:['Funan'],clue:'Kerajaan awal yang disebut bersama Champa.'},
 {id:'t4-islam',form:4,chapter:9,page:225,text:'Perlembagaan menetapkan agama ___ sebagai agama Persekutuan, dan agama lain boleh diamalkan dengan aman dan damai.',answers:['Islam'],clue:'Salah satu unsur tradisi dalam perlembagaan.'},
 {id:'t4-kaum-muda',form:4,chapter:2,page:36,text:'Golongan ___ menyalurkan idea pembaharuan melalui gerakan Islah dan menubuhkan madrasah.',answers:['Kaum Muda'],clue:'Mereka sering berselisih pendapat dengan Kaum Tua.'},
 {id:'t4-mountbatten',form:4,chapter:3,page:83,text:'Lord ___ menandatangani pernyataan menyerah kalah tentera Jepun di Singapura pada 12 September 1945.',answers:['Mountbatten'],clue:'Pemerintah Tertinggi Tentera Bersekutu di Asia Tenggara.'},
 {id:'t4-sitc',form:4,chapter:2,page:35,text:'Maktab Perguruan ___ (SITC) menjadi medan ilmu untuk menghasilkan karya nasionalisme.',answers:['Sultan Idris'],clue:'Kini sebuah universiti pendidikan di Tanjung Malim.'},
 {id:'t4-london',form:4,chapter:9,page:216,text:'Rombongan kemerdekaan yang diketuai Tunku Abdul Rahman berangkat ke ___ untuk berunding dengan British.',answers:['London'],clue:'Ibu kota Britain.'}
];

const T5:FactPuzzle[]=[
 {id:'t5-september-1963',form:5,chapter:5,page:104,text:'Malaysia diisytiharkan pada 16 ___ 1963.',answers:['September'],clue:'Bulan kesembilan.'},
 {id:'t5-durbar',form:5,chapter:3,page:42,text:'Majlis Raja-Raja bermula dengan pembentukan ___ pada tahun 1897, seiring dengan penubuhan NNMB.',answers:['Durbar'],clue:'Persidangan raja-raja; yang pertama diadakan di Kuala Kangsar.'},
 {id:'t5-mei-1969',form:5,chapter:6,page:129,text:'Peristiwa rusuhan antara kaum berlaku pada 13 Mei ___, beberapa hari selepas Pilihan Raya Umum Ketiga.',answers:['1969'],clue:'Hujung dekad 1960-an.'},
 {id:'t5-jengka',form:5,chapter:4,page:72,text:'Segitiga ___ ialah Rancangan Pembangunan Wilayah pertama FELDA yang merangkumi Temerloh, Jerantut dan Maran.',answers:['Jengka'],clue:'Terletak di Pahang.'},
 {id:'t5-asean-1967',form:5,chapter:9,page:210,text:'ASEAN diwujudkan pada 8 Ogos ___ untuk meningkatkan semangat setia kawan serantau.',answers:['1967'],clue:'Dua tahun selepas Singapura berpisah daripada Malaysia.'},
 {id:'t5-dewan-negara',form:5,chapter:2,page:27,text:'Parlimen mengandungi dua Dewan, iaitu Dewan Rakyat dan Dewan ___.',answers:['Negara'],clue:'Ahlinya dikenali sebagai Senator.'},
 {id:'t5-saga',form:5,chapter:8,page:187,text:'Proton ___, kereta nasional pertama Malaysia, dilancarkan pada 1 September 1985.',answers:['Saga'],clue:'Nama sejenis pokok dan biji merah yang kecil.'},
 {id:'t5-cobbold',form:5,chapter:5,page:100,text:'Suruhanjaya ___ dibentuk pada Januari 1962 untuk meninjau reaksi penduduk Sarawak dan Sabah.',answers:['Cobbold'],clue:'Dinamakan sempena pengerusinya, seorang Lord.'},
 {id:'t5-rukun-1970',form:5,chapter:7,page:157,text:'Rukun Negara diisytiharkan secara rasmi oleh Yang di-Pertuan Agong pada 31 Ogos ___.',answers:['1970'],clue:'Ulang tahun kemerdekaan yang ke-13.'},
 {id:'t5-ligitan',form:5,chapter:10,page:227,text:'Pada tahun 2002, Mahkamah Antarabangsa memutuskan Pulau Sipadan dan ___ menjadi hak milik Malaysia.',answers:['Ligitan'],clue:'Pertikaian ini melibatkan Malaysia dan Indonesia.'},
 {id:'t5-razak-mageran',form:5,chapter:6,page:130,text:'Majlis Gerakan Negara (MAGERAN) dipengerusikan oleh Tun Abdul ___.',answers:['Razak','Razak Hussein'],clue:'Perdana Menteri Malaysia yang kedua.'},
 {id:'t5-mohor',form:5,chapter:3,page:43,text:'Persidangan Majlis Raja-Raja perlu disertai oleh Penyimpan ___ Besar Raja-Raja untuk memeterai keputusan.',answers:['Mohor'],clue:'Cap rasmi yang digunakan untuk mengesahkan dokumen.'},
 {id:'t5-singapura-1965',form:5,chapter:6,page:119,text:'Tunku Abdul Rahman mengumumkan pemisahan Singapura daripada Malaysia di Dewan Rakyat pada 9 Ogos ___.',answers:['1965'],clue:'Dua tahun selepas Malaysia dibentuk.'},
 {id:'t5-felda',form:5,chapter:4,page:72,text:'Pada tahun 1956, kerajaan menubuhkan ___ atau Lembaga Kemajuan Tanah Persekutuan.',answers:['FELDA','Federal Land Development Authority'],clue:'Singkatan nama Inggerisnya, lima huruf.'},
 {id:'t5-kuala-lumpur-zopfan',form:5,chapter:9,page:210,text:'Deklarasi ZOPFAN (Zon Aman, Bebas dan Berkecuali) diumumkan pada tahun 1971 di ___.',answers:['Kuala Lumpur','KL'],clue:'Ibu negara Malaysia.'},
 {id:'t5-rukun-negara',form:5,chapter:1,page:7,text:'Kedaulatan undang-undang ialah prinsip keempat dalam ___.',answers:['Rukun Negara'],clue:'Ideologi kebangsaan dengan lima prinsip.'},
 {id:'t5-deb-1990',form:5,chapter:8,page:166,text:'Dasar Ekonomi Baru (DEB) dilaksanakan selama 20 tahun, dari tahun 1970 hingga tahun ___.',answers:['1990'],clue:'Tambah 20 kepada 1970.'},
 {id:'t5-jskm',form:5,chapter:5,page:99,text:'Jawatankuasa Setia ___ Malaysia (JSKM) ditubuhkan di Singapura pada 23 Julai 1961.',answers:['Kawan'],clue:'Sinonim "sahabat".'},
 {id:'t5-akta-1967',form:5,chapter:7,page:148,text:'Akta Bahasa Kebangsaan diperkenalkan pada tahun ___ di bawah Perkara 152 Perlembagaan Persekutuan.',answers:['1967'],clue:'Sedekad selepas merdeka.'},
 {id:'t5-ops-daulat',form:5,chapter:4,page:79,text:'Ops ___ dilancarkan pada 5 Mac 2013 selepas pencerobohan pengganas di Lahad Datu, Sabah.',answers:['Daulat'],clue:'Perkataan Melayu lama yang bermaksud kuasa dan kemuliaan raja.'},
 {id:'t5-agong',form:5,chapter:1,page:8,text:'Ketua Utama Negara ialah Yang di-Pertuan ___.',answers:['Agong'],clue:'Dipilih oleh Majlis Raja-Raja.'},
 {id:'t5-konfrontasi',form:5,chapter:5,page:106,text:'Pada 20 Januari 1963, Menteri Luar Indonesia, Dr. Subandrio, mengumumkan dasar ___ terhadap Malaysia.',answers:['Konfrontasi'],clue:'Bermaksud penentangan secara bersemuka.'},
 {id:'t5-penyata-razak',form:5,chapter:7,page:144,text:'Dasar Pendidikan Kebangsaan dilaksanakan melalui Penyata ___ 1956 dan dimaktubkan dalam Ordinan Pelajaran 1957.',answers:['Razak'],clue:'Nama Menteri Pelajaran ketika itu.'},
 {id:'t5-wawasan-2020',form:5,chapter:8,page:174,text:'Dasar Pembangunan Nasional (DPN) bertujuan menjadikan Malaysia negara maju berdasarkan Wawasan ___.',answers:['2020'],clue:'Tahun sasaran wawasan ini.'},
 {id:'t5-lima-tahun',form:5,chapter:3,page:50,text:'Pada asasnya, pilihan raya umum diadakan dalam tempoh ___ tahun.',answers:['lima','5'],clue:'Bilangan jari sebelah tangan.'},
 {id:'t5-sabah',form:5,chapter:4,page:67,text:'Malaysia dibentuk daripada 11 negeri Tanah Melayu, Singapura, Sarawak dan ___.',answers:['Sabah','Borneo Utara'],clue:'Dahulu dikenali sebagai Borneo Utara.'},
 {id:'t5-barisan-nasional',form:5,chapter:3,page:57,text:'Pada tahun 1974, Parti Perikatan dikenali dengan nama baharu, iaitu Barisan ___.',answers:['Nasional'],clue:'Singkatannya BN.'},
 {id:'t5-ma63',form:5,chapter:5,page:103,text:'Perjanjian Malaysia yang ditandatangani pada Julai 1963 turut dikenali sebagai Malaysia Agreement atau ___.',answers:['MA63'],clue:'Dua huruf dan dua angka tahun.'},
 {id:'t5-sri-aman',form:5,chapter:6,page:123,text:'Operasi Sri ___ dilancarkan di Sarawak pada 21 Oktober 1973 untuk menamatkan ancaman komunis.',answers:['Aman'],clue:'Lawan kepada "huru-hara".'},
 {id:'t5-oic-57',form:5,chapter:9,page:214,text:'Malaysia menyertai Pertubuhan Kerjasama Islam (OIC) yang dianggotai oleh ___ buah negara.',answers:['57','lima puluh tujuh'],clue:'Antara 50 dan 60.'},
 {id:'t5-ukm',form:5,chapter:7,page:149,text:'Universiti ___ Malaysia (UKM) menjadi pusat keilmuan bahasa Melayu.',answers:['Kebangsaan'],clue:'Sinonim "nasional".'},
 {id:'t5-senarai-persekutuan',form:5,chapter:4,page:69,text:'Kuasa Kerajaan Persekutuan yang tertakluk dalam Perlembagaan Persekutuan dikenali sebagai Senarai ___.',answers:['Persekutuan'],clue:'Bukan Senarai Negeri atau Senarai Bersama.'}
];

function interleave(a:FactPuzzle[],b:FactPuzzle[]){const out:FactPuzzle[]=[];for(let i=0;i<Math.max(a.length,b.length);i++){if(a[i])out.push(a[i]);if(b[i])out.push(b[i])}return out}

export const FACT_PUZZLES:FactPuzzle[]=interleave(T4,T5);
/** Puzzle #1 is played on this Malaysia date. */
export const FACT_EPOCH='2026-11-03';
