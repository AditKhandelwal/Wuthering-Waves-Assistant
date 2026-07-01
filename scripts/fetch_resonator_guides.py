# import requests, time, json
# from deep_translator import GoogleTranslator

# headers = {
#     "x-os": "pc",
#     "x-language": "zh-Hans",
#     "Referer": "https://wuwaguide.kurogames.com/",
#     "Origin": "https://wuwaguide.kurogames.com"
# }

# MISSING_IDS = [1103, 1104, 1202, 1205, 1301, 1302, 1407]

# def translate(text):
#     if not text:
#         return text
#     try:
#         return GoogleTranslator(source='zh-CN', target='en').translate(text)
#     except Exception as e:
#         print(f"  Translation error: {e}")
#         return text

# def get_best_guide_chinese(role_id):
#     list_resp = requests.get(
#         "https://guide-server.aki-game.net/introduction/list",
#         params={"roleGbId": str(role_id)},
#         headers=headers
#     ).json()
    
#     if not list_resp.get('data'):
#         return None
    
#     for entry in list_resp['data']:
#         info_resp = requests.get(
#             "https://guide-server.aki-game.net/introduction/info",
#             params={"roleGbId": str(role_id), "id": entry['id']},
#             headers=headers
#         ).json()
        
#         if not info_resp.get('data'):
#             time.sleep(0.2)
#             continue
            
#         base_texts = info_resp['data'].get('baseTexts', [])
#         zh = next((t for t in base_texts if t['language'] == 'zh-Hans'), None)
        
#         if zh and zh.get('introductionDetail'):
#             return info_resp['data']
        
#         time.sleep(0.2)
    
#     return None

# # Step 1: re-fetch all 39 original characters
# VALID_IDS = [1102,1103,1104,1105,1106,1107,1108,1109,1202,1203,
#              1204,1205,1206,1207,1208,1209,1210,1211,1301,1302,
#              1303,1304,1305,1306,1307,1308,1402,1403,1404,1405,
#              1406,1407,1408,1409,1410,1411,1412,1501,1502,1503,
#              1504,1505,1506,1507,1508,1509,1510,1511]

# en_headers = {
#     "x-os": "pc",
#     "x-language": "en",
#     "Referer": "https://wuwaguide.kurogames.com/",
#     "Origin": "https://wuwaguide.kurogames.com"
# }

# all_characters = {}

# print("Re-fetching all characters in English...")
# for role_id in VALID_IDS:
#     list_resp = requests.get(
#         "https://guide-server.aki-game.net/introduction/list",
#         params={"roleGbId": str(role_id)},
#         headers=en_headers
#     ).json()
    
#     if not list_resp.get('data'):
#         continue
    
#     top_id = list_resp['data'][0]['id']
#     info_resp = requests.get(
#         "https://guide-server.aki-game.net/introduction/info",
#         params={"roleGbId": str(role_id), "id": top_id},
#         headers=en_headers
#     ).json()
    
#     if info_resp.get('data'):
#         all_characters[str(role_id)] = info_resp['data']
#         name = info_resp['data']['role']['texts'][0]['name']
#         print(f"  Fetched: {name} ({role_id})")
    
#     time.sleep(0.3)

# print(f"\nFetched {len(all_characters)} English characters.")

# # Step 2: translate missing ones
# print("\nTranslating missing characters...")
# for role_id in MISSING_IDS:
#     print(f"Processing {role_id}...")
#     data = get_best_guide_chinese(role_id)
    
#     if not data:
#         print(f"  No data found")
#         continue
    
#     base_texts = data.get('baseTexts', [])
#     zh = next((t for t in base_texts if t['language'] == 'zh-Hans'), None)
    
#     if zh:
#         print(f"  Translating...")
#         translated = {
#             "language": "en",
#             "introductionName": translate(zh.get('introductionName', '')),
#             "introductionSource": zh.get('introductionSource', ''),
#             "roleDescription": translate(zh.get('roleDescription', '')),
#             "introductionSynopsis": translate(zh.get('introductionSynopsis', '')),
#             "introductionDescription": translate(zh.get('introductionDescription', '')),
#             "introductionDetail": translate(zh.get('introductionDetail', '')),
#             "skillDisplayDescription": translate(zh.get('skillDisplayDescription', ''))
#         }
        
#         data['baseTexts'] = [t for t in base_texts if t['language'] != 'en']
#         data['baseTexts'].insert(0, translated)
        
#         name = data['role']['texts'][0]['name']
#         all_characters[str(role_id)] = data
#         print(f"  Done: {name} ({role_id})")
    
#     time.sleep(0.5)

# # Step 3: save with UTF-8
# with open('wuwa_characters.json', 'w', encoding='utf-8') as f:
#     json.dump(all_characters, f, indent=2, ensure_ascii=False)

# print(f"\nDone. {len(all_characters)} total characters saved.")
import json

CORRECT_NAMES = {
    '1103': 'Baizhi',
    '1104': 'Lingyang', 
    '1202': 'Chixia',
    '1205': 'Changli',
    '1301': 'Calcharo',
    '1302': 'Yinlin',
    '1407': 'Ciaccona'
}

with open('wuwa_characters.json', encoding='utf-8') as f:
    data = json.load(f)

for role_id, correct_name in CORRECT_NAMES.items():
    if role_id in data:
        for text in data[role_id]['role']['texts']:
            if text['language'] == 'en':
                text['name'] = correct_name
        print(f"Fixed: {correct_name}")

with open('wuwa_characters.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Done.")
import json, re

with open('wuwa_characters.json', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total characters: {len(data)}\n")

issues = []

for role_id, char in data.items():
    texts = char['role']['texts']
    en_text = next((t for t in texts if t['language'] == 'en'), None)
    name = en_text['name'] if en_text else texts[0]['name']
    base_texts = char.get('baseTexts', [])
    en = next((t for t in base_texts if t['language'] == 'en'), None)
    
    # Check for issues
    char_issues = []
    
    if not en:
        char_issues.append("NO ENGLISH BASETEXT")
    else:
        if not en.get('introductionDetail'):
            char_issues.append("missing introductionDetail")
        if not en.get('introductionSynopsis'):
            char_issues.append("missing introductionSynopsis")
        if not en.get('roleDescription'):
            char_issues.append("missing roleDescription")
        
        # Check for leftover Chinese characters
        detail = en.get('introductionDetail', '')
        if re.search(r'[\u4e00-\u9fff]', detail):
            char_issues.append("contains Chinese characters")
    
    if not char.get('roleAttribute', {}).get('items'):
        char_issues.append("missing stat thresholds")
    
    if not char.get('weapon', {}).get('items'):
        char_issues.append("missing weapons")
    
    if not char.get('echo', {}).get('main', {}).get('echoProps'):
        char_issues.append("missing echo recommendation")
    
    if char_issues:
        issues.append((name, role_id, char_issues))
        print(f"⚠️  {name} ({role_id}): {', '.join(char_issues)}")
    else:
        print(f"✅ {name} ({role_id})")

print(f"\n{'='*50}")
print(f"Total issues: {len(issues)} characters with problems")
print(f"Clean: {len(data) - len(issues)} characters")