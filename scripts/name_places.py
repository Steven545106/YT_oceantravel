"""Give every place in scripts/source-data/places.json a Traditional Chinese name.

1. Each place is matched to its GeoNames entry (same feature code and position) and its id kept as `gid`.
2. Places whose name is not Chinese (Latin, Japanese kana, Korean hangul) take the Wikidata label of the item with that
   GeoNames id (P1566), preferring zh-tw, zh-hant, zh-hk, then zh / zh-cn converted to Traditional.
3. The rest are made up: geographic words are translated (Pulau → 島, Teluk → 灣, Huyện → 縣, Island → 島 …), Korean
   syllables become their usual hanja, Japanese kana and the remaining words are transliterated syllable by syllable,
   and Chinese pinyin goes back to characters. These names are approximate.
4. Japanese names written in kanji are converted to Traditional forms (広島 → 廣島) and ノ / ヶ become 之.
The original name is kept as the first alias, so searches by it still work. Run it again after build_world.py adds
countries: places already named in Chinese are left alone.

Needs opencc-python-reimplemented. Run from the project root:
  <venv>/bin/python scripts/name_places.py <folder with GeoNames <CC>.txt dumps> <cache folder>
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from opencc import OpenCC

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'scripts', 'source-data')
CJK = re.compile(r'[一-鿿]')
KANA = re.compile(r'[぀-ヿ]')
HANGUL = re.compile(r'[가-힯]')
s2t = OpenCC('s2t')
# Japanese new forms back to the traditional ones (広 → 廣): OpenCC's JPVariants list read backwards, then s2t for the rest
_variants = os.path.join(os.path.dirname(__import__('opencc').__file__), 'dictionary', 'JPVariants.txt')
JP_OLD = {}
for _line in open(_variants, encoding='utf-8'):
    _old, _new = _line.rstrip('\n').split('\t')
    JP_OLD.setdefault(_new.split()[0], _old)
for _same in '御弁才欠缶余予芸疏連煙醋粧台沪床唇群稜':   # already proper Traditional characters in their own right
    JP_OLD.pop(_same, None)


class _Jp2t:
    @staticmethod
    def convert(text):
        return ''.join(JP_OLD.get(ch, ch) for ch in text)   # not s2t: it reads Japanese 御 as simplified 禦


jp2t = _Jp2t()


def needs_name(name):
    return not CJK.search(name) or KANA.search(name) or HANGUL.search(name)


# --- GeoNames ids -------------------------------------------------------------------------------------------------
def match_ids(country_code, places, geonames_folder):
    path = os.path.join(geonames_folder, f'{country_code}.txt')
    if not os.path.exists(path):
        return 0
    wanted = {}
    for place in places:
        if 'gid' not in place:
            wanted.setdefault((place['type'], round(place['lat'], 3), round(place['lon'], 3)), []).append(place)
    found = 0
    for line in open(path, encoding='utf-8'):
        f = line.rstrip('\n').split('\t')
        key = (f[7], round(float(f[4]), 3), round(float(f[5]), 3))
        for place in wanted.get(key, []):
            if 'gid' not in place:
                place['gid'] = int(f[0])
                found += 1
    return found


# --- Wikidata -----------------------------------------------------------------------------------------------------
def wikidata_names(gids, cache_path):
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    todo = [g for g in gids if str(g) not in cache]
    for start in range(0, len(todo), 300):
        batch = todo[start:start + 300]
        values = ' '.join(f'"{g}"' for g in batch)
        query = ('SELECT ?gn ?lang ?label WHERE { VALUES ?gn { ' + values + ' } ?item wdt:P1566 ?gn . ?item rdfs:label ?label . '
                 'BIND(LANG(?label) AS ?lang) FILTER(?lang IN ("zh-tw","zh-hant","zh-hk","zh","zh-cn","zh-hans")) }')
        url = 'https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(query)
        request = urllib.request.Request(url, headers={'User-Agent': 'YT-Ocean-Travel-data-build/1.0 (steven19950221@gmail.com)'})
        for attempt in range(4):
            try:
                rows = json.load(urllib.request.urlopen(request, timeout=120))['results']['bindings']
                break
            except Exception as error:   # rate limits and timeouts: wait and retry
                print('wikidata retry', attempt, error)
                time.sleep(10 * (attempt + 1))
        else:
            continue
        labels = {}
        for row in rows:
            labels.setdefault(row['gn']['value'], {})[row['lang']['value']] = row['label']['value']
        for g in batch:
            options = labels.get(str(g), {})
            best = next((s2t.convert(options[l]) for l in ('zh-tw', 'zh-hant', 'zh-hk') if l in options), None)   # some still hold simplified forms
            if best is None:
                best = next((s2t.convert(options[l]) for l in ('zh', 'zh-cn', 'zh-hans') if l in options), None)
            cache[str(g)] = best
        json.dump(cache, open(cache_path, 'w'), ensure_ascii=False)
        print(f'wikidata {min(start + 300, len(todo))}/{len(todo)}')
        time.sleep(1)
    return {int(k): clean_label(s2t.convert(v)) for k, v in cache.items() if v}


# Wikidata labels are often mainland or Hong Kong usage; Taiwan's usual names for the same places
TAIWAN_TERMS = {'悉尼': '雪梨', '澳大利亞': '澳洲', '新西蘭': '紐西蘭', '布里斯班': '布里斯本', '塔斯曼尼亞': '塔斯馬尼亞', '羣': '群'}


def clean_label(label):
    """Drop disambiguation ("大三角帆島 (澳大利亞)") and council names ("布里斯本市政府"), use Taiwan's terms."""
    label = re.sub(r'\s*[（(][^）)]*[)）]$', '', label)
    label = re.sub(r'(?<=[市區郡縣])政府$', '', label)
    for a, b in TAIWAN_TERMS.items():
        label = label.replace(a, b)
    return label


# --- Made-up names ------------------------------------------------------------------------------------------------
# Generic words (after accents are stripped, lower case) and what they become; `prefix` words such as directions go in
# front of the name, the rest after it.
SUFFIX = {
    '島': 'pulau pulo nusa gili ko koh kho ile ilot ada adasi jazirat jazireh jezireh jazira jaziratu dao hon con island isle islet isla ilha cay kyun motu pu ostrov aral araly',
    '群島': 'kepulauan gugusan islands iles ilots adalari jaza\'ir jazair archipelago araldary quan',
    '灣': 'teluk ao vinh korfezi koyu khawr khor bay gulf baie khalij cove inlet sound bight zaliv kultuk',
    '角': 'tanjung tanjong tg laem mui burnu ras cape point punta ujung head headland mys',
    '港': 'pelabuhan port harbour harbor limani mina wharf',
    '燈塔': 'lighthouse fanar mercusuar',
    '礁': 'rock rocks reef shoal karang batu',
    '環礁': 'atoll',
    '潟湖': 'lagoon',
    '灘': 'beach',
    '溪': 'creek brook',
    '瀑布': 'falls waterfall',
    '山脈': 'range ranges',
    '半島': 'peninsula semenanjung yarimadasi',
    '山': 'mount mt hill mountain gunung bukit dagi tepe jabal kuh gora tau uul dag dagh mta',
    '縣': 'kabupaten amphoe huyen shahrestan daerah zila regency county',
    '市': 'kota city municipality mueang thanhpho thixa sehir qalasy kalasy shahri',
    '區': 'kecamatan district ilcesi khet tambon tehsil upazila qada qadaa division subdistrict borough markaz raion rayon audany tumani etrap',
    '省': 'provinsi propinsi province ostan muhafazat muhafazah tinh changwat ili governorate wilayah aimag aymag',
    '州': 'wilayat state oblast oblysy viloyati welayaty',
    '村': 'kampung kampong desa village aul selo',
    '鎮': 'town tran',
    '河': 'river sungai reka darya daryasy gol',
    '湖': 'lake danau ozero kol kul koli nuur',
    '海峽': 'strait selat',
    '水道': 'channel',
}
PREFIX = {
    '北': 'north northern nord utara nuea kuzey bac shamali',
    '南': 'south southern sud selatan tai guney janubi',
    '東': 'east eastern timur dogu sharqi',
    '西': 'west western ouest barat bati gharbi',
    '中': 'central tengah wusta',
    '大': 'great big besar gede kabir buyuk lon',
    '小': 'little small kecil saghir kucuk nho',
    '新': 'new baru yeni',
    '上': 'upper ulu',
    '下': 'lower hilir',
    '聖': 'saint st san santo santa',
}
DROP = {'of', 'the', 'de', 'historical'}
ARTICLES = {'al', 'el', 'ad', 'ar', 'as', 'ash', 'at', 'az', 'an', 'adh', 'ath', 'ed', 'es', 'et', 'en', 'ez'}   # Arabic, dropped where Arabic is spoken
FRENCH = {'新喀里多尼亞', '法屬玻里尼西亞', '瓦利斯和富圖納'}
FRENCH_ARTICLES = {'le', 'la', 'les', 'des', 'du', 'd', 'l', 'aux', 'et'}
ARABIC = {'敘利亞', '黎巴嫩', '以色列', '巴勒斯坦地區', '約旦', '埃及', '沙烏地阿拉伯', '葉門', '阿曼', '阿拉伯聯合大公國', '卡達', '巴林', '科威特', '伊拉克'}
WORDS = {}
for chinese, words in SUFFIX.items():
    for word in words.split():
        WORDS[word] = ('suffix', chinese)
for chinese, words in PREFIX.items():
    for word in words.split():
        WORDS[word] = ('prefix', chinese)

# syllable → character: onset × (a, e, i, o, u), then the same with a nasal ending (an, en, in, on, un)
TABLE = '''
-  阿埃伊奧烏 安恩因翁溫
b  巴貝比博布 班本賓邦本
p  帕佩皮波普 潘彭平龐蓬
m  馬梅米莫穆 曼門明蒙文
f  法費菲福富 凡芬芬豐芬
v  瓦維維沃武 萬文溫翁溫
d  達德迪多杜 丹登丁東敦
t  塔特蒂托圖 坦滕廷通屯
n  納內尼諾努 南嫩寧農嫩
l  拉萊利洛盧 蘭倫林隆倫
r  拉雷里羅魯 蘭倫林榮倫
g  加格吉戈古 甘根金貢袞
k  卡克基科庫 坎肯金孔昆
h  哈赫希霍胡 漢亨欣洪洪
j  賈傑吉喬朱 詹珍金瓊君
ch 查切奇喬丘 詹臣欽瓊春
sh 夏謝希紹舒 山申欣雄順
s  薩塞西索蘇 桑森辛松孫
z  扎澤齊佐祖 贊曾津宗尊
w  瓦韋威沃武 萬文溫翁溫
y  亞耶伊約尤 揚延尹永雲
ng 雅額伊歐吳 安恩因翁溫
'''
SYLLABLE = {}
for row in TABLE.strip().splitlines():
    onset, plain, nasal = row.split()
    onset = '' if onset == '-' else onset
    for vowel, a, b in zip('aeiou', plain, nasal):
        SYLLABLE[onset + vowel] = a
        SYLLABLE[onset + vowel + 'n'] = b
ONSETS = sorted({k[:-1] for k in SYLLABLE if not k.endswith('n')} - {''}, key=len, reverse=True)
CODA = {'r': '爾', 'l': '爾', 's': '斯', 'k': '克', 't': '特', 'p': '普', 'd': '德', 'g': '格', 'b': '布', 'f': '夫', 'v': '夫',
        'z': '茲', 'm': '姆', 'n': '恩', 'j': '吉', 'c': '克', 'w': '烏', 'y': '伊', 'x': '克斯', 'q': '克', 'ch': '奇', 'sh': '什'}

PINYIN = dict(item.split(':') for item in '''a:阿 ai:愛 an:安 ang:昂 ao:澳 ba:巴 bai:白 ban:班 bang:邦 bao:寶 bei:北 ben:本 beng:崩 bi:碧 bian:邊 biao:標 bie:別
bin:濱 bing:冰 bo:博 bu:布 ca:擦 cai:彩 can:燦 cang:滄 cao:草 ce:策 cen:岑 ceng:曾 cha:茶 chai:柴 chan:禪 chang:長 chao:潮 che:車 chen:陳
cheng:城 chi:赤 chong:崇 chou:仇 chu:楚 chuan:川 chuang:創 chui:吹 chun:春 chuo:綽 ci:慈 cong:叢 cu:粗 cui:翠 cun:村 cuo:錯 da:大 dai:岱
dan:丹 dang:當 dao:道 de:德 deng:登 di:底 dian:店 diao:釣 die:蝶 ding:鼎 dong:東 dou:斗 du:杜 duan:端 dui:堆 dun:墩 duo:朵 e:鵝 en:恩 er:二
fa:發 fan:帆 fang:方 fei:飛 fen:汾 feng:峰 fo:佛 fu:福 ga:嘎 gai:蓋 gan:甘 gang:岡 gao:高 ge:閣 gen:根 geng:耿 gong:公 gou:溝 gu:古 gua:瓜
guai:拐 guan:關 guang:光 gui:桂 gun:滾 guo:國 ha:哈 hai:海 han:漢 hang:杭 hao:浩 he:河 hei:黑 hen:恆 heng:橫 hong:紅 hou:後 hu:湖 hua:華
huai:淮 huan:環 huang:黃 hui:惠 hun:渾 huo:火 ji:吉 jia:嘉 jian:尖 jiang:江 jiao:蛟 jie:界 jin:金 jing:京 jiong:炯 jiu:九 ju:居 juan:卷
jue:覺 jun:君 ka:卡 kai:開 kan:坎 kang:康 kao:靠 ke:可 ken:肯 keng:坑 kong:孔 kou:口 ku:庫 kua:跨 kuai:快 kuan:寬 kuang:礦 kui:奎 kun:昆
kuo:闊 la:拉 lai:萊 lan:蘭 lang:浪 lao:老 le:樂 lei:雷 leng:冷 li:里 lian:蓮 liang:梁 liao:遼 lie:烈 lin:林 ling:嶺 liu:柳 long:龍 lou:樓
lu:鹿 lv:呂 luan:鑾 lun:崙 luo:羅 ma:馬 mai:麥 man:曼 mang:芒 mao:茅 mei:梅 men:門 meng:蒙 mi:米 mian:綿 miao:苗 min:閩 ming:明 mo:墨
mou:牟 mu:木 na:那 nai:乃 nan:南 nang:囊 nao:瑙 nei:內 nen:嫩 neng:能 ni:尼 nian:年 niang:娘 niao:鳥 nie:聶 ning:寧 niu:牛 nong:農 nu:奴
nv:女 nuan:暖 nuo:諾 ou:歐 pa:帕 pai:排 pan:盤 pang:龐 pao:泡 pei:佩 pen:盆 peng:彭 pi:皮 pian:片 piao:漂 pin:品 ping:平 po:坡 pu:浦 qi:奇
qia:恰 qian:千 qiang:羌 qiao:橋 qie:且 qin:秦 qing:青 qiong:瓊 qiu:秋 qu:曲 quan:泉 que:鵲 qun:群 ran:冉 rang:讓 rao:饒 re:熱 ren:仁
ri:日 rong:榕 rou:柔 ru:如 ruan:阮 rui:瑞 run:潤 ruo:若 sa:薩 sai:賽 san:三 sang:桑 sao:騷 se:色 sen:森 seng:僧 sha:沙 shai:篩 shan:山
shang:上 shao:韶 she:社 shen:深 sheng:勝 shi:石 shou:壽 shu:樹 shuang:雙 shui:水 shun:順 shuo:碩 si:四 song:松 sou:搜 su:蘇 sui:遂 sun:孫
suo:所 ta:塔 tai:台 tan:潭 tang:塘 tao:桃 te:特 teng:騰 ti:梯 tian:天 tiao:條 tie:鐵 ting:亭 tong:桐 tou:頭 tu:土 tuan:團 tui:推 tun:屯
tuo:陀 wa:瓦 wai:外 wan:萬 wang:王 wei:威 wen:文 weng:翁 wo:沃 wu:武 xi:西 xia:下 xian:仙 xiang:香 xiao:小 xie:斜 xin:新 xing:興 xiong:雄
xiu:秀 xu:徐 xuan:玄 xue:雪 xun:巡 ya:雅 yan:岩 yang:陽 yao:堯 ye:葉 yi:宜 yin:銀 ying:英 yong:永 you:有 yu:玉 yuan:元 yue:月 yun:雲 za:雜
zai:再 zan:贊 zang:藏 zao:棗 ze:澤 zeng:曾 zha:扎 zhai:寨 zhan:湛 zhang:章 zhao:昭 zhe:浙 zhen:鎮 zheng:鄭 zhi:芝 zhong:中 zhou:舟 zhu:珠
zhuan:磚 zhuang:莊 zhui:追 zhun:准 zhuo:卓 zi:紫 zong:宗 zou:鄒 zu:祖 zuan:鑽 zui:嘴 zun:尊 zuo:左'''.split())
PINYIN_WORDS = {'dao': '島', 'yu': '嶼', 'shan': '山', 'wan': '灣', 'gang': '港', 'zhou': '洲', 'jiao': '礁', 'ao': '澳', 'tou': '頭',
                'zui': '嘴', 'xian': '縣', 'qu': '區', 'zhen': '鎮', 'cun': '村', 'hu': '湖', 'he': '河', 'bandao': '半島',
                'qundao': '群島', 'liedao': '列島', 'haixia': '海峽', 'haiwan': '海灣', 'shi': '市', 'xiang': '鄉', 'jiaozi': '角子'}

# Korean syllables read the Sino-Korean way, and the usual endings of Korean place names
HANJA = dict(item.split(':') for item in '''가:加 각:角 간:干 갈:葛 감:甘 강:江 개:開 거:巨 건:建 검:劍 견:見 결:結 경:慶 계:桂 고:高 곡:谷 곤:昆 골:骨
공:公 과:果 곽:郭 관:官 광:光 괴:槐 교:橋 구:九 국:國 군:君 굴:窟 궁:宮 권:權 귀:貴 규:圭 균:均 금:金 기:基 길:吉 김:金 나:羅 낙:洛 난:蘭
남:南 낭:浪 내:內 녀:女 노:老 녹:鹿 농:農 뇌:雷 능:陵 니:尼 다:多 단:丹 달:達 담:潭 답:畓 당:堂 대:大 덕:德 도:道 독:獨 돈:敦 돌:乭 동:東
두:豆 둔:屯 득:得 등:燈 라:羅 락:樂 란:蘭 람:藍 랑:浪 래:來 량:良 려:麗 력:力 련:蓮 렬:烈 령:嶺 례:禮 로:路 록:鹿 론:論 뢰:雷 료:料 룡:龍
루:樓 류:柳 륙:陸 륜:輪 률:栗 릉:陵 리:里 린:麟 림:林 립:立 마:馬 막:幕 만:萬 말:末 망:望 매:梅 맥:麥 맹:孟 면:面 명:明 모:毛 목:木 몽:夢
묘:妙 무:武 묵:墨 문:文 물:勿 미:美 민:民 밀:密 박:朴 반:半 발:發 방:方 배:培 백:白 번:番 벌:伐 범:凡 법:法 벽:碧 변:邊 별:別 병:兵 보:寶
복:福 본:本 봉:鳳 부:富 북:北 분:粉 불:佛 붕:鵬 비:飛 빈:濱 빙:氷 사:沙 산:山 살:薩 삼:三 상:上 새:塞 색:色 생:生 서:西 석:石 선:仙 설:雪
섬:蟾 성:城 세:世 소:小 속:束 손:孫 송:松 쇄:碎 수:水 숙:宿 순:順 술:戌 숭:崇 슬:瑟 습:濕 승:勝 시:時 식:植 신:新 실:實 심:深 십:十 쌍:雙
아:牙 악:岳 안:安 암:岩 압:鴨 앙:仰 애:愛 앵:鶯 야:夜 약:藥 양:陽 어:漁 억:億 언:彦 엄:嚴 여:麗 역:驛 연:蓮 열:悅 염:鹽 엽:葉 영:永 예:禮
오:五 옥:玉 온:溫 옹:甕 와:臥 완:莞 왕:王 외:外 요:堯 용:龍 우:牛 욱:旭 운:雲 울:鬱 웅:熊 원:元 월:月 위:蝟 유:柳 육:陸 윤:尹 율:栗 융:隆
은:銀 을:乙 음:陰 읍:邑 응:鷹 의:義 이:伊 익:益 인:仁 일:日 임:林 입:立 자:紫 작:鵲 잠:蠶 장:長 재:才 저:猪 적:赤 전:全 절:節 점:點 정:井
제:濟 조:鳥 족:足 존:尊 종:鍾 좌:左 주:州 죽:竹 준:俊 중:中 증:曾 지:知 직:直 진:珍 질:叱 집:集 차:車 착:着 찬:讚 찰:察 참:參 창:昌 채:彩
책:冊 처:處 척:尺 천:千 철:鐵 첨:尖 청:青 체:體 초:草 촉:燭 촌:村 총:銃 최:崔 추:秋 축:丑 춘:春 출:出 충:忠 취:翠 측:側 치:雉 칠:七 침:枕
쾌:快 타:他 탁:卓 탄:炭 탐:耽 탑:塔 태:太 택:宅 토:土 통:通 퇴:退 투:投 파:波 판:板 팔:八 패:貝 팽:彭 편:片 평:平 폐:廢 포:浦 표:表 품:品
풍:豐 피:皮 필:筆 하:下 학:鶴 한:韓 할:割 함:咸 합:合 항:港 해:海 핵:核 행:杏 향:香 허:許 헌:軒 현:玄 혈:穴 협:峽 형:兄 혜:惠 호:虎 혹:惑
혼:魂 홍:紅 화:花 환:環 활:活 황:黃 회:回 획:劃 횡:橫 효:孝 후:後 훈:訓 휴:休 흑:黑 흥:興 희:喜 히:希 큰:大 작:小 앞:前 뒤:後 섬:島'''.split())
KOREAN_ENDINGS = [('군도', '群島'), ('열도', '列島'), ('반도', '半島'), ('방파제등대', '防波堤燈塔'), ('등대', '燈塔'), ('도', '島'), ('섬', '島'),
                  ('만', '灣'), ('곶', '岬'), ('항', '港'), ('군', '郡'), ('시', '市'), ('구', '區'), ('읍', '邑'), ('면', '面'), ('리', '里'),
                  ('산', '山'), ('포', '浦'), ('여', '礁'), ('암', '岩')]

# Japanese kana, one character per mora
KANA_TABLE = dict(zip('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ',
                      '阿伊烏惠奧加基久計古佐志須世曾多知津手都奈仁努根野波比富部保真美武目茂八由與良利留禮呂和乎恩賀岐具下吾座地豆瀨曾田治津出土馬美武部保巴比布貝保'))


def strip_accents(text, country):
    if country == '越南':
        text = text.replace('đ', '\u0000').replace('Đ', '\u0000').replace('d', 'z').replace('D', 'z').replace('\u0000', 'd')
    text = text.replace('ı', 'i').replace('ł', 'l').replace('ß', 'ss').replace('ø', 'o').replace('æ', 'ae')
    if country == '土耳其':
        text = text.replace('ç', '\u0001').replace('Ç', '\u0001').replace('ş', '\u0002').replace('Ş', '\u0002').replace('c', 'j').replace('C', 'j')
        text = text.replace('\u0001', 'ch').replace('\u0002', 'sh').replace('ğ', '')
    text = ''.join(ch for ch in unicodedata.normalize('NFKD', text) if not unicodedata.combining(ch))
    text = re.sub(r"[‘’ʻʼ'`´ʿʾ]", '', text).lower()
    return text


def respell(word, country):
    """Spellings of each language turned into the plain onsets the syllable table knows."""
    word = re.sub(r'^ma?c(?=[^aeiouyh])', 'mak', word)   # McLennan, MacKay → 麥克…
    word = re.sub(r'(iy|yy)$', 'i', word)   # Russian adjectives: Kargalinskiy → 卡爾加林斯基
    for a, b in [('wh', 'w'), ('tch', 'ch'), ('dj', 'j'), ('tj', 'ch'), ('oe', 'u'), ('kh', 'h'), ('gh', 'g'), ('dh', 'z'), ('ph', 'p' if country in ('泰國', '寮國', '柬埔寨') else 'f'),
                 ('th', 't'), ('ny', 'n'), ('nh', 'n'), ('sy', 'sh'), ('zh', 'j'), ('qu', 'kw'), ('x', 's' if country == '越南' else 'h' if country == '烏茲別克' else 'ks'), ('q', 'k'),
                 ('aa', 'a'), ('ee', 'i'), ('oo', 'u'), ('uu', 'u'), ('ii', 'i'), ('ae', 'e'), ('gi', 'zi' if country == '越南' else 'gi')]:
        word = word.replace(a, b)
    if country in ('印尼', '馬來西亞', '汶萊', '新加坡', '東帝汶'):
        word = word.replace('c', 'ch').replace('chh', 'ch')
    word = re.sub(r'c(?!h)', 'k', re.sub(r'c(?=[eiy])', 's', word))
    return re.sub(r'([bcdfgjklmnpqrstvwxz])\1', r'\1', word)   # Abbas → abas


def phonetic(word, country):
    word = respell(re.sub(r'[^a-z]', '', word), country)
    out, i = [], 0
    vowels = 'aeiouy'
    while i < len(word):
        onset = ''
        for candidate in ONSETS:
            if word.startswith(candidate, i) and i + len(candidate) < len(word) and word[i + len(candidate)] in vowels:
                onset = candidate
                break
        j = i + len(onset)
        if j < len(word) and word[j] in vowels:
            vowel = 'i' if word[j] == 'y' else word[j]
            j += 1
            nasal = ''
            if j < len(word) and word[j] in 'nm' and (j + 1 >= len(word) or word[j + 1] not in vowels):
                nasal = 'n'
                j += 2 if word.startswith('ng', j) else 1
            out.append(SYLLABLE.get(onset + vowel + nasal) or SYLLABLE.get(onset + vowel) or SYLLABLE[vowel])
            i = j
        else:
            two = word[i:i + 2]
            if two in CODA:
                out.append(CODA[two]); i += 2
            else:
                if word[i] in CODA and not (word[i] == 'h'):
                    out.append(CODA[word[i]])
                i += 1
    # the usual written endings: Tasmania 塔斯馬尼亞, Wellington 威靈頓
    if word.endswith('ia') and out and out[-1] == SYLLABLE['a']:
        out[-1] = '亞'
    if word.endswith('ton') and out and out[-1] == SYLLABLE.get('ton'):
        out[-1] = '頓'
    return ''.join(out)


def pinyin_word(word):
    out, i = [], 0
    keys = sorted(PINYIN, key=len, reverse=True)
    word = word.replace('v', 'v').replace('ü', 'v')
    while i < len(word):
        for key in keys:
            if word.startswith(key, i):
                out.append(PINYIN[key]); i += len(key)
                break
        else:
            return None   # not pinyin after all
    return ''.join(out)


def korean(name):
    ending = ''
    for suffix, chinese in KOREAN_ENDINGS:
        if name.endswith(suffix) and len(name) > len(suffix):
            name, ending = name[:-len(suffix)], chinese
            break
    out = []
    for ch in name:
        if ch in HANJA:
            out.append(HANJA[ch])
        elif HANGUL.match(ch):
            code = ord(ch) - 0xAC00   # unknown syllable: by its sound
            initial, medial, final = code // 588, (code % 588) // 28, code % 28
            roman = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'][initial]
            roman += ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'][medial]
            roman += ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'][final]
            out.append(phonetic(roman, '韓國'))
        elif CJK.match(ch) or ch.isdigit():
            out.append(ch)
    return s2t.convert(''.join(out)) + ending


def japanese(name):
    name = re.sub(r'(?<=[一-鿿])[ノの](?=[一-鿿])', '之', name)
    name = re.sub(r'(?<=[一-鿿])[ヶケが](?=[一-鿿])', '之', name)
    out = []
    for ch in name:
        if KANA.match(ch):
            hira = chr(ord(ch) - 0x60) if 'ァ' <= ch <= 'ヶ' else ch
            out.append(KANA_TABLE.get(hira, ''))
        else:
            out.append(ch)
    return jp2t.convert(''.join(out))


def made_up(name, country):
    if HANGUL.search(name):
        return korean(name)
    if KANA.search(name) or (country == '日本' and CJK.search(name)):
        return japanese(name)
    plain = strip_accents(re.sub(r"\b[dlDL][‘’'`](?=\w)", '', name), country).replace('thanh pho', 'thanhpho').replace('thi xa', 'thixa')
    words = [w for w in re.split(r"[\s\-/,()]+", plain) if w]
    prefix, core, suffix = [], [], []
    for word in words:
        if word in DROP or (country in ARABIC and word in ARTICLES) or (country in FRENCH and word in FRENCH_ARTICLES):
            continue
        if country in ('中國', '香港', '澳門', '台灣') and word in PINYIN_WORDS:
            suffix.append(PINYIN_WORDS[word]); continue
        kind = WORDS.get(word)
        if kind:
            (prefix if kind[0] == 'prefix' else suffix).append(kind[1])
            continue
        if word.isdigit():
            core.append(word); continue
        if country in ('中國', '香港', '澳門', '台灣'):
            converted = pinyin_word(word)
            if converted:
                core.append(converted); continue
        core.append(phonetic(word, country))
    if not core and suffix:   # a name that is only a generic word ("Teluk Besar" has a core, "The Bay" does not)
        core, suffix = suffix[:1], suffix[1:]
    return ''.join(dict.fromkeys(prefix)) + ''.join(core) + ''.join(dict.fromkeys(suffix))


def main(geonames_folder, cache_folder):
    path = os.path.join(SOURCE, 'places.json')
    data = json.load(open(path))
    registry = {c['name']: c['code'].upper() for c in json.load(open(os.path.join(SOURCE, 'regions.source.json')))['countries']}
    os.makedirs(cache_folder, exist_ok=True)
    for country, entry in data['countries'].items():
        places = entry['places']
        found = match_ids(registry.get(country, ''), places, geonames_folder)
        todo = [p for p in places if needs_name(p['name']) or (country == '日本' and jp2t.convert(p['name']) != p['name'])]
        if not todo:
            continue
        labels = wikidata_names([p['gid'] for p in todo if 'gid' in p], os.path.join(cache_folder, 'wikidata-zh.json'))
        official = made = 0
        for place in todo:
            original = place['name']
            name = labels.get(place.get('gid')) if needs_name(original) else None
            if name and not needs_name(name) and not re.search(r'[A-Za-z]', name):   # not half-translated ("Judge及Clerk島")
                official += 1
            else:
                name = made_up(original, country)
                made += 1
            if not name or name == original:
                continue
            place['name'] = name
            place['aliases'] = [original] + [a for a in place['aliases'] if a not in (original, name)]
        print(f'{country}: ids {found}, Wikidata {official}, made up {made}')
    json.dump(data, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main(*sys.argv[1:3])
