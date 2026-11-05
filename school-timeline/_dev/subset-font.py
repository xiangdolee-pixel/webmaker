# Pretendard(SIL OFL 1.1) 가변 글꼴 → 이 사이트 글자만 남긴 fonts/st-sans.woff2
#   OFL: 고친 글꼴(일부 글자만 남김 = Modified Version)은 예약 이름(Pretendard)을 쓰면 안 된다
#        → 글꼴 안의 이름을 'SchoolTimeline Sans' 로 바꾸고 OFL 원문(fonts/OFL.txt)을 함께 둔다.
#   쓰는 법: pip install fonttools brotli → node _dev/subset-font.mjs <PretendardVariable.woff2>
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

src, text_file, out = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(text_file, encoding='utf-8').read()
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.notdef_outline = True
font = TTFont(src)
sub = subset.Subsetter(opts)
sub.populate(text=text)
sub.subset(font)

FAMILY = 'SchoolTimeline Sans'
name = font['name']
for rec in list(name.names):
    s = rec.toUnicode()
    if rec.nameID in (1, 4, 16, 21):
        rec.string = s.replace('Pretendard Variable', FAMILY).replace('Pretendard', FAMILY)
    elif rec.nameID in (3, 6, 20, 25):
        rec.string = s.replace('PretendardVariable', 'SchoolTimelineSans').replace('Pretendard', 'SchoolTimelineSans')
left = [r.nameID for r in name.names if 'Pretendard' in r.toUnicode() and r.nameID in (1, 3, 4, 6, 16, 20, 21, 25)]
assert not left, left
font.save(out)
