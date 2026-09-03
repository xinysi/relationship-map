# -*- coding: utf-8 -*-
"""人物名统一化（幂等版）：
   restore 模式：从原始目录恢复全部文档（清除历史误替换）
   inspect 模式：预览替换计划
   apply   模式：执行统一（规则幂等，可安全重复执行）
"""
import io, os, re, sys, json, shutil

os.chdir(os.path.dirname(os.path.abspath(__file__)))
SL = 'sl'
SRC = r'D:\games_file\ckhy_string\剧情整理'
MODE = sys.argv[1] if len(sys.argv) > 1 else 'inspect'

# 历史误替换的级联清理（幂等）
CASCADE_FIX = [
    ('多里安·布莱克·布莱克', '多里安·布莱克'),
    ('阿纳斯塔西娅·格里姆·格里姆', '阿纳斯塔西娅·格里姆'),
    ('阿利斯泰尔·格雷·格雷', '阿利斯泰尔·格雷'),
    ('理查德·格雷·格雷', '理查德·格雷'),
    ('约翰·格雷·格雷', '约翰·格雷'),
    ('彼得·斯皮萨克·斯皮萨克', '彼得·斯皮萨克'),
    ('布兰顿·格雷·格雷', '布兰顿·格雷'),
    ('管家管家', '管家'),
    ('管家管家阿尔弗雷德', '管家阿尔弗雷德'),
    ('约翰·约翰', '约翰'),
]

# 主角占位名统一（规则自带幂等：替换结果不含左侧锚词）
PROTAGONIST_RULES = [
    ('女主角（玩家角色，文本未给出名字）', '安娜·格雷'),
    ('女主角(玩家角色，文本未给出名字)', '安娜·格雷'),
    ('女主角(姨妈)', '安娜·格雷'),
    ('姨妈(主角)', '安娜·格雷'),
    ('主角（姓名文本未提及）', '安娜·格雷'),
    ('女主角', '安娜·格雷'),
    ('主角', '安娜·格雷'),
]

def surname_rule(short, full):
    """追加姓氏类规则：short 未接 full 时才替换（幂等）"""
    tail = full.split(short, 1)[1] if short in full else ''
    return (short + (r'(?!' + re.escape(tail) + ')' if tail else ''), full, 'regex')

PER_FILE = {
    '02': [(r'(?<!约翰)(?<!约翰·)格雷(?!家族|家|堡|镇|勋爵|与狼)', '约翰·格雷', 'regex')],
    '03': [(r'(?<!约翰)(?<!约翰·)格雷(?!家族|家|堡|镇|勋爵|与狼)', '约翰·格雷', 'regex')],
    '04': [(r'布兰登(?!·格雷)', '布兰顿·格雷', 'regex')],
    '07': [(r'约翰(?!·格雷|逊)', '约翰·格雷', 'regex')],
    '10': [(r'(?<!管家)阿尔弗雷德', '管家阿尔弗雷德', 'regex')],
    '12': [('理查德的头骨', '理查德·格雷')],
    '13': [('白夫人/劳拉·曼斯菲尔德(Laura Mansfield)', '劳拉·曼斯菲尔德（白夫人）'),
           ('白夫人/劳拉·曼斯菲尔德', '劳拉·曼斯菲尔德（白夫人）'),
           ('加百利·曼斯菲尔德/伯爵(Gabriel Mansfield)', '小加百利·曼斯菲尔德'),
           ('加百利·曼斯菲尔德/伯爵', '小加百利·曼斯菲尔德')],
    '16': [('理查德的头骨', '理查德·格雷')],
    '17': [('埃琳娜', '艾琳娜')],
    '20': [(r'彼得(?!·斯皮萨克)', '彼得·斯皮萨克', 'regex')],
    '21': [(r'阿纳斯塔西娅(?!·格里姆)', '阿纳斯塔西娅·格里姆', 'regex'), (r'理查德(?!·格雷)', '理查德·格雷', 'regex')],
    '22': [('理查德的头骨', '理查德·格雷'), (r'阿纳斯塔西娅(?!·格里姆)', '阿纳斯塔西娅·格里姆', 'regex'), (r'理查德(?!·格雷)', '理查德·格雷', 'regex')],
    '23': [(r'理查德(?!·格雷)', '理查德·格雷', 'regex')],
    '24': [(r'多里安(?!·布莱克)', '多里安·布莱克', 'regex'), (r'阿纳斯塔西娅(?!·格里姆)', '阿纳斯塔西娅·格里姆', 'regex')],
    '25': [('比利·格雷', '比利')],
    '27': [(r'阿利斯泰尔(?!·格雷)', '阿利斯泰尔·格雷', 'regex')],
}

def apply_rules(text, rules):
    counts = []
    for old, new in CASCADE_FIX:
        n = text.count(old)
        if n:
            text = text.replace(old, new)
            counts.append(('级联清理 ' + old[:12], new, n))
    for item in rules:
        if len(item) == 3 and item[2] == 'regex':
            pat, rep = item[0], item[1]
            before = len(re.findall(pat, text))
            text = re.sub(pat, rep, text)
            if before:
                counts.append((pat[:16] + '…', rep, before))
            continue
        old, new = item
        n = text.count(old)
        if n:
            text = text.replace(old, new)
            counts.append((old, new, n))
    return text, counts

def rules_for(fn):
    if '总览' in fn:
        # 总览全名统一（顺序敏感：先长词后短词，守卫防止二次追加）
        return [
            ('理查德的头骨', '理查德·格雷'),
            (r'(?<!布里)安娜(?!·格雷)', '安娜·格雷', 'regex'),
            (r'理查德(?!·格雷)', '理查德·格雷', 'regex'),
            (r'塞缪尔(?!·格雷)', '塞缪尔·格雷', 'regex'),
            (r'阿纳斯塔西娅(?!·格里姆)', '阿纳斯塔西娅·格里姆', 'regex'),
            (r'多里安(?!·布莱克)', '多里安·布莱克', 'regex'),
            (r'阿利斯泰尔(?!·格雷|·布莱克)', '阿利斯泰尔·格雷', 'regex'),
            (r'(?<!管家)阿尔弗雷德(?!·格雷-纳什)', '管家阿尔弗雷德', 'regex'),
            (r'托马斯(?!·格雷)', '托马斯·格雷', 'regex'),
            (r'约翰(?!·格雷|逊|娜)', '约翰·格雷', 'regex'),
            ('埃琳娜', '艾琳娜'),
        ]
    numM = re.search(r'(\d{2})', fn)
    key = numM.group(1) if numM else ''
    return list(PROTAGONIST_RULES) + list(PER_FILE.get(key, []))

files = sorted(f for f in os.listdir(SL) if f.endswith('.md'))

if MODE == 'restore':
    n = 0
    for fn in files:
        src = os.path.join(SRC, fn)
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(SL, fn))
            n += 1
    print('restored', n, 'files from', SRC)
    sys.exit(0)

report = {}
changed = 0
for fn in files:
    path = os.path.join(SL, fn)
    with io.open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    new_text, counts = apply_rules(text, rules_for(fn))
    if counts:
        report[fn] = counts
    if MODE == 'apply' and new_text != text:
        with io.open(path, 'w', encoding='utf-8') as f:
            f.write(new_text)
        changed += 1

if MODE == 'apply':
    print('changed files:', changed)
print(json.dumps(report, ensure_ascii=False, indent=1))
