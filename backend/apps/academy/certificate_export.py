"""Certificate -> PDF rendering for EduIgnite Academy.

Reuses the same dependency-fallback-safe HTML->PDF helper already used for
every other PDF export on this backend (exam questions, career reports,
guidance reports) -- see ``apps/ai_features/pdf_utils.py``. No new PDF
library is introduced here.

Design matches the CEO-approved reference certificate exactly: off-white
card, the real EduIgnite shield mark, a gold "CERTIFICATE OF COMPLETION"-
style headline, a four-column footer (Presented By / Duration / Date /
Credential ID), and a faint repeating diagonal "PRINTED BY EDUIGNITE
ACADEMY" watermark. Uses the site's actual established brand palette and
type -- navy ``#264D73`` / gold accent, ``Newsreader``-style serif
headline -- the same values already hard-coded across the Academy frontend
(see ``apps/website/src/app/academy/certificates/page.tsx``).

Engine note (found live, 2026-09-13): this backend's PDF engine falls back
from WeasyPrint to xhtml2pdf whenever WeasyPrint's native Pango libraries
aren't installed on the host (see pdf_utils.py) -- and xhtml2pdf does not
implement flexbox, position, transform, or opacity at all, silently
DROPPING those rules rather than erroring. An earlier version of this
template used all four for the footer layout and the watermark, and
rendered correctly under WeasyPrint but produced a badly broken PDF under
the xhtml2pdf fallback (the "absolutely positioned, low-opacity, rotated"
watermark became a full-strength, non-rotated block sitting ABOVE the
actual content, and the "flex" footer collapsed into an unlabelled
vertical stack). Confirmed via direct production testing (SSM into the
deploy box, rendering a real certificate through the live code path) --
see the Dockerfile fix landing alongside this file for the actual
root-cause fix (installing WeasyPrint's real dependencies), and the
footer/logo changes below for defense in depth: a plain <table> and a
raster <img> degrade far more gracefully than flex/inline-SVG if a PDF
is ever rendered by xhtml2pdf again for any reason.
"""

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape

# The real EduIgnite shield mark (apps/website/public/icons/eduignite-icon-192.png),
# inlined as a raster PNG so the PDF never depends on a network fetch back
# to the site, and renders identically regardless of which PDF engine is
# active (inline SVG rendering support is unreliable/absent in the
# xhtml2pdf fallback -- see module docstring).
_SHIELD_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAgAElEQVR4nO2dB1hU17r3Pe3ec+53vvvde+7JF6kDzGBsSUyMnkSBkT40xYIFcYbm0LtdI7aoUWMs2EsUY0NRsdHsoCBSjdiNRhBUrCdHY9Tkvc9aw4xT9t6z9hQGzPo/z/s8yQjDntn/37vftda71+7UiYqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqMhQiSRJ3Z39U7rRb5DqNyeRX3Kok3/Kj60xytLHQ0XVJrINSfuL0D95pdA/BdTDyT85SyCW/ZmeBqq3VkL/JHehf/JlbfPj8EsBJ0nSDaFviq+lj5OKyqQS+Md3FvmlZIuYjN9qfqFf8puQJB0QSZJs6Wmg6tDqLo7/q9AveYrIL/mxkNT8KgiSHzlJkieh97D056Ci4iWrQPl/iPySU0R+Kc2sWZ/L/GrhJElqcZIkTUTvSU8DVbsWytaigJRUkV/KXWR84pKHJCTJzU5+CSn0ikDV7uTol95F6Jc8X+SX8khpfJOaH0cSOPklgaNv4lNH38Q1Tn4J71v6c1P9lhUS8geRJDVI6JdcLPJP+VWv8U1gfieJZjhKEiuFfonS3r3lf7L010H1W1Bm5u+dJMkuQv+UJUL/5CZ10xtiflFAKg4u47OZXyvuOEqSljj5JfZHx2jpr4nqbTS9X+pSoV9KI5PpDSl5PgyfBSG7T8PwvWegV/Qc4qzPHYmoRGpxkiRmO0qSgsTizD9a+uuj6oCyD4j7b2FgSrDQPxWt2DaJ/FNBEcabv0tQOngv3AERp69A5JlrOCJKr4Bf1l7oEjzOKPPrhE9Ck5NPwgqhb/wg9Jks/b1StVN94J3xf5wDUr2EAanzRQEppcKA1JdvTM9tfj4lT9+kxRB6uFJlfO0YXVAD/0j7mqf5E5nD9004ovBJ+MXRJ6EeDaAdJYkhAnHKf1n6e6eykJwCk+2dAtIGCwNS5gkDUsqEASmvlPW4rvGNN3/P0Z9D0LrDrMbXjsC1h6Bn6DTTmV8jEnA4+Ma/cvSJP+PgEz9XIEkY7OSVbE8N+ZYJLR4JAzJ6CwPSpK3ZPV8YkHpfZXbtIDQ+acnTY+RUXNqEl14mNr96WRS0/jAHCIabny0cfOLvO/rEH3b0jp/v4Bs/xt434WPbT9P+YunzSMWu3wn8x3UWBqZ+LPJLG+rsnzbe2T9tlbN/WqEoIO2Gs3/qL6KANGazm9H8KONj45e8qfMNDfQekuV7oYcGCNzGd+JpfEdl+KhHvCK8435x8I67LvCJL3Twjl/l4B0/3t4nYSiCA/U4oXNADWpmdQ/J/DdhQPpAUWDaF6LAtFzngNQy58C0BlFg2kvngDRgC1Obn6vkQf/eN/lrCM4+CpGnrxptfKYrwqDNxdAn6SvFINlEWd9Rx/hq5m8NB44Q+MS/FHjHNTh4x5U5eMfmOnjHznH0jgvqHhLybxQMI4UWeJwD08c5B6bfdw5MA50w1vwmqPe7hUwB8axNEHqokr+pT1/Bxib7+auqGHWwEtxmboSuwyZY1PwOKLxRxOmEwCvunsA7Lp1OxRookSTpHVFg+lnnwHTgY36RweYnL3neGzIe+k1cCQM3FxlU36MIyT0DH0bNgQ/CZ8OwnBJi86sHgmfojhPgmrkeugyZYFLzOxCZP44kyrqI5X+nVwMecvKa+P9EgekXDTO/eer9bsOngMuUNTBwUzFEnDK8tg/Nr4b+k9cob4DBgf4bvffo/Bpi82tH+KkrEPRNIXw2cSW8N3S8YfW+j8nNr4x6kSTpPykEhHIOTM8xS8nDx/wBadAr6gvwnL8Vr9gaW9eHFdWBePYmEAWmsk5rCgNSMByjC2qJjc8Wow6eA5+vd8HHsV+CMCDZdCWPDz/zC1rD3itmOwWAQEL/9H6WqPe7DhkPfZMXY8MP3noMpMfrTTJ4HV1YC24zNoBzUBrx4pZzYCr+nbBC40FAIT1+AYK3HAGPuVugd/wCcB6YbtJ634HT/LFvwiv2UwqBvuwfkLbT3PV+1yEToHfsAnCdtg78V+yDEXlnTT5zM2THCfg0YxkIA9+UOnxXdlHm/kf6MlznGw3C6TeBxg4j9pbj6VWXKauh19i5IBqYZsqSh8n89CqgT2jGwDkw9Ykp6n3noHToMepzbHSXSavB56udELzlKEudbZqQnbgIfln7cKObyfp5Wmd4PpDNBL/le/HfMMb8XDE6vxpPtXot3AafTcjCYHQNmaRYJDPS/K0APO5EG/TY9d6gFAc+Jc/7YZnQN+krcJ22FrwWboeANYdwthxdUA3hxNOLxi9UDdpUBJ9NWGFEMxv5qq5oYDp8Nj5LMQNVctkkxo/UE+jvhOZXwZDtx8Bv1X7wmP8t9Ju0EnrHzofuIyfr1PtM5leGk5ectlywqUtgch8+9f6og1VtYnLtwNOP20+C69S1uJwyoH/fJC0NXYIzcAkzZPuJ1vUE05s/Uk+MOnCOM+trh61nXB86DuAaAPOo99sSgDHF53FvDpqu7DZsksn6903Vz4Ng6Ju2BCTL9yjKvDYEQEBoflwGucf1owDwBICt3jcnAGgWaPC3x8D9i2z4MHJ2a8sDv1sWDa33je7nQWOG8JkwYPY3EPxt64yWmQAYiQEgMz8FwAAAuAa7pgQgrLAOZ3g0/fiRfD6erzfmft22yPqkq7roPXuMngafjl8OvstyYfi+cqONH9EaGgB4kQAwll4BSAHQN9NjCAAoG4bsKgW/FXngNmMj9E5YBO8Nm2zQjeodwfxs8/vOQ8bBR7HzwXX6elw2hewqAemxel7mVwFAYHxFxFAASK4ApPP7bACg/pzhe8tg4KYi8Pl6N4hnbIS+KUugR+h0EKKb0M20S0N7Mz/vVV2feOg2YhJ8krQIXD5fB96LcyDomwJ83zKecdIyPz8AYigAJCUQn5YGNgDQNKi59+dpN/V+G7U0hOZX6ZifHACF+ekVgAgA8n4efQC01f487Snrm6ufJ9QgAN4YnwJAIKF/Uj8+LQ1cAJjW/B273jdFP08obwB0zU+vAMYAwNDIxgZAKBMAli552lu9z7OlIZQXACzm96SDYMMAYOniJAbA0ubvYPW+A8PKLjkAHOanABgAAEcLMxEABprfLWIGBCUuUEUXjj7+dl3yGNi/L9Ba3NIPQIx+81MAeABAcL8uFwAushkwb8N+1pBOXclZ7+85VgUvXoMq+oyawtv8H8fMB49536qiR+jnZjd/v8mrIbLsOsirfgD/lft5ASDgaGngBoDQ/BQAQgAI79piBSC/GkZNWK5hYO3YfKCUs+QhB4A987st2gExtY2qQL065q73ZScvafzNnmHTNUzeUzodBszZDD3DPic2vyEA6BifAkAIAI/7dU0LgGa9TwYAd8nDDIB5633U+6P8exEll3FLBzJ4n+TFIDt1WfVvveMXEpufLwCs5qdXAL4AcN+ozgeA03XXOUoghfm7DUyHrq23LnIDQFbvkwDg5J+Ee/wNKXmY7uJy8kuEzyauALfMDXjbFKXJUduH+rEgAAQs5kf3Jjv4xhsEALv55YqgvUCkAOjfooQPACt3HmGt9yWx86Ck9hr89OpXeP7qVzh8+jwUll3QAcA/bj5cb2xRxZx1e7Hx42avh+sNLaqQz1inF4DuI6fC0J0nQV5zG/9byJ4zIFm2B8YcvaCK98Omg5NvgsZrQRsLoG/qEnyfL/q9qLIbuKRRzu+j1gX1n0dQDMs5hdsY1I8FtTaMOXoBug6fhI0vCkoFv5X78PgB/0xNA4zYVw695HOJAdBrfgoAyRWAfH8ePgBcunUP8k7UqGJYumIXZhdpJtx/+pyzXFICEJy8SOO15duLMAAZi77VeD11QTYnAKh3X3ZKs1ZXmk79/1FLM/p59ddQjS+vUkCjDHlNA/QYrajph+0u1fg3BMDowhrdv9Ua3UZNwVeSMUe+Y/x3BOhHMfM4AeAsedTNTwEwHACmVV1jxgBJ8zfhcmZ7fpnG61d+uA9nzt9gAGCyLgDbinC5wwxAAisA3ot3apr6xEUI0TIuivcZAFBeLcK1BrsDZn3DCkDA2oMQVlyn8fqoQ+dg2K4SvIcQyvzq44aPY+dD4IZ81WvoSmAYAFrmpwDwB4CrpQFtEWgwAPMUADQ9+KfqtZanz6HX0An49dK6a8QApPMEAB2fKsNW34ZuwyfjGj84u1gvAGibFWTq3omLNF73XbqbFQDmMcACVX2vXh4N3nYMPo77Eu9hpH6FCS3gAwCD8SkA/AHQ18/DB4C8E9UQNjkLRqOYlAV9R03FA171nyn77oZqoLt5fwkRAI4GABB5prXOrm3EdbhykOv55Va9AITsLsH1fs8x0zVeR7tRswGABrroRh8mAIQByazlkSZ4NYQAcJifXgHIASBpZOMDABoEa09jOvunwLOXv2iUP8p/O1JxUQeAgYkLNF5bs/sYBmBaVg45AD4JID2mGMAqB7Fo5gYBELj+kH4AdiEA4ogBEGAAYnUA+CRxEQbAUZKgMfZAQA7KLoZB2UUaMbqwmgAAPeanAJABQNrFyQcANNC93vhAFcps/92NJo2fyz5QCqtyjuLZIA0ARk6GT0OnabzW2PIUZq7eA1dv3ycDIFUBAJqVUX990OYi8F60A6/emh4AxTTnpxOyNN8n9zS+39k5OANvo6gaA5RegT7Ji6DLkHToHjoF7w/03tBxBGMAAvN70GlQvQDwaWE2Zgxwq/kRBiBzVa7eGSAlACJJko7ZUTx+9jMvANA8PUnZYUoAuo2crDN7FINmgUZOwXeAoTqf/ThmQOhhLgAIzU8BMAAAjmY2bgCWEQGAyiBU76tnfHR1OHbukg4AqNyRTlkJD398oXq94uItmLk6lwcAinofDVrVTYeOGV0J1H+++6gpGBijAMB79SsGu2hxbGzlDzoACLxi4dOMpTptFCiiz92E7qOmGgeA0vwUAB4AEHRxcgHQfWA6uIXPYI3+0ukaK7tu4ZkQPWMtBCcvxItjn4ycrPHzIj+0w7Jihffj4ZNAOmUFDE79CoSSROgZnIF/Xxk9ghUru10GZUCPUVNVIQpI0VjV7TZiCvRNWwofxc4Dp4BkjdmhqLM3cH2OTI12X1MGejYBes1RkqjxepdB6djsXYaMg24jJylixCSdloYuQzKgd+JC3BrRc8x0jU5OR584+CB8BvRNXQx9kr+CDyJm4hVhVOIYDIC6+T3G0pVgIgAIW5i5AGjv/fsj91fgFVxktH4TV8DwPWUamdd/1X6T7MfJ535dAUdLA28AtI3vMRbsKAAEVwAe/fvGAWDZ/v2x526x1txhRbU4oxvTv2+o8QUsLQ28ANAyv51a0F4gvQAktwEAlr95Jbripm69XXETr8qKBqZaJOsLOPp5iAHgMD8FoF0A0D7u10X9N6j2R4NPNDj+IHIWXg9oLyWPvdbiFhEAesxPATApAEkGAPB23q9rbvPb6wOApd6nAJgNAEX/PjkAb/f9uuYoeey16npWAParA8BufHoFMAkAmvvzkAHQTs1v/PO22sz89kQA6Dc/LYGMAkB3ixL9ALSPer8jljz2vAAgMz8FwGAAmPfn4QaA1vumMr+9HgBIzU8BMAgA9s2pmAG4ygyApUueDlTv25sLAPdoug5ADoD+/Th1AbjKDIClzd/B6n17cwDgHk0BIL8CkG1JqAnAVWYAaL1vtPntPYwBQGF8CgAxAOT7cb4B4KouAHR+3+B6355hYcsgANSMTwEgBIDPZrQKAK5yAkDrfcOzvr3a/P4ovgAwmJ+OAUgA4NHFqQ8AWu+bxvx2fAFgMT8FQB8APqQAJOoFgM7vm878dsQAsBtfGdZ0ZzhjAUjkCQDt5zHE+PZaWV0vAHqMj8KWAmDMFUB3YUs/ANzmV84SOfok/gbn99V+3yNGbz8PJwCE5qcAGAwAc0vDqANcADCbHt1w4xyYBl2C0qFLUMabCESRrng8a+tT4dHfQL/TUef3Bd4x4OATh5MBnl4OSMHPX0afU+OzB6Xj/VhRArDzkPMEoILY/BQAgwBg7+fhAwCaXXLWOfGEEZiBoUG3a6JjQvfJtrd+HvSzDj7ocyaDc0AqOCOgDfiszoFp+PhMAYCtTkTRMQA/ALj7eUgBEPonG2Z8PUYR+Sfjm9P1XQnMY35k+HgQSpDhDQQ7iD3QexsDAJP5KQDEVwCyLk4SANCl39TmYApUNqHjQiWH2ep9b7RzAwI6pU0+k8A7ziAA2MxPASACgLyFWT8AiYaXPYZGYDo2KDKqqbI+2q4Eg9zGn8U5MB3sPfkBwGZ8HANoCWQYACz9PPoAYMuUn4Zlwoa8Erhw8y5cbmiB0+e/h9zjNbA69zjMXLMPxs7aAB7Rc6HrwHHGXRUCUvFxGGp+VNOj9zDmGNBncIucA6OnrYH0JTth7pYCWLW/FHJK6qCo7jrkV12F+d8Wwieh0xl/H33PaH5/1OFKTgBsCcxPAeB7BdDTz6MPAKbs3182E75vfgzPX4EqnuH4VRX/ao0Hz36Gc1caYFvRWZi4NAckcQvgPQOgEAWmEYCglvF94/FAlu/fQcfmFTMfEr7cAll7TsCBiotQffs+XGh+hOM7pmhC8RCOfXcD+obpQoAARAbnAoDU/BQAPgAQdHFyAeDkk8Bokh1FFfD8NRABoIwflfHyV7jz6BkcOP0dTFiaA59JZ/ArKQJSFduVsxgf/Rtf4yPTJizYApvyy6HiRhPUNz9ShdL4rAA0KcyvjCW7jzH+DUUJRAoAs/EpAHwAIGxh5gTAN4nxZDY9+pfB5kfxT7V48vMvcKb+Fsxef4AXDKg0w4NkpfHRM7p4zFT9IywTJmXtgryyC3Ch+SFcbH6Eg7/5H6nMf77pIZReuc349wRecgIA2LM+BYBQTn4Jn/Dp3x+RV64LwOmrEFZYi6dRmU6mMdn/n1rxVC0e/fQaDpy5ADFzNkG34PH6rwZB6fgBeChIBrddg8dD+Ix1sKW4AurvPICLdx+9CS3zG5L9z7cGMwAx+DtlAiBk7xli86Owd4/uTeqH35xEkqTufPbnGZZ7Wsf8KMYcvwBC30RmAEyU/bUBQPGkNeob7sOkrN3Qc+hE3nW8drw/ZCKkfrUNTlz4Hi7dfaQKdfObIvuf5wDAwSsWP9SDCYChu0qIzY9C4BbVzdI+a7ey90505NPFOXTHSQ3jKyP81BWjAfiRR/ZXN/+Tl7/gePzzL3D9/hPIXLMPegyewNv43YMnwITlu6D8aoOG8TXMb4Lsf54QgPCSS4wAoGeKkRhfGZ3dIwWW9lm7laNH8rt87tcN3npMx/zKQCukXACYK/srza8edbfuQfSsDcTml05fC8fP34DLdx/jYAXAYPPzA8DRO47R/CjQ45PIzB+Jo7NLxDuW9lm7lUiS9J982pgHfVPICgDb/PkbAH41a/ZXj0etkX/2EriGz2Y1votsJmw/WqUyPqf5zZD961gAQHuWsgEQuOEwsflRvCOO/6ulfdZuJRZn/pFP/37QusOsAHQJZp6vN3X2f6In+z/Sih8eP4MhGct0jmtQ6mKoRgtzauZv6+xfxwKAMCiVFQD/1XnE5kfRKSTkD5b2WbuWg2/CS9ItSnyX5bIC0GPU5xwAEJjfxNlfGQ9//gXSFm/XOa74ednk5jdT9q9jAQA9RokNAK/FO4nMbzMgEqwHRP5kaX+1ezn4JLSQ7s+DnnLIBkCvyC8YTybnwPflL1BYcQnW5Z2CnUcqoajiMpy72gjX7z6Bh89fGZ39HxoBAB/z1za2wMlLt2H/uUuw5WgVrNh3Cr7cWgjZxefg/J0HvAH4MHIWKwBuM9brzfo2yhBH3rO0v9q9HH0Takg3p+o3eSUrAOjRQ8wAsGf/q00PYPa6/aqYpRVLtxdD7okaOHvpNtx5/Fwz+//MDcBDPQDEaQHAJ/tX3GiG/eX1sGZ/KczceBDGL8uBcSyBWh7YzF/HAkCfhIWsAPTNWEJmfhRuEZWW9le7l6NPfB63+d/crtg7YQErAP0mruQNwA8P/glzNhxkBUA9Zq7bD8t2HoW9p+rg/A93sclJsr8hAGibH2X54rrrsOFQGcxuNbx6sJl/QtZuKL3SwBuAzyZksQLw4dg5ZOYXR4K1OHKPpf3V7uXgE59FuiXh+2MyWQEQz/iGEwC22r/+9n3Yd7IWNhwohUVbCjkBUEQezFybB4u3FsHh8otwo+UpZ/YnAYAt+5+50oBXgmesz9MxPZv5P1+7DxZuL4a1B05DYd11TvPXsQCAHq/KBkDXkZMY631t87cCsNTS/mr3cvBJmEi6H6fz4HGsAPh+vcsgALRnfu7/62e40vQQyi7+AHtO1MCyHUfUzP8GAPVYtfckVFxthIcvXvMGQNv89XcfweFzl2DB1kKYwGJ6ZczaeBAbfV95PRyrvwlVDS2sLQ9M5q9lAQB9l2wAOPolcGZ99bAWR46ztL/avZx840fx2X9/TPF5RgCCvyliBcDYRa+Gx8+h7NJtyDleDfM3H9Yw/wy1yNp9HM5duwMPXrxWmf8BAuAr/QBcbH4IhVVXYG52PkxYnoPNrw3A1DX7YHVeKW6KO/t9k0HTnnUEAAz6pojR/GHFdcTmxwC4RQy3tL/avZy84l34bFEyZNtxRgCGbj9hEAB8pz0fPH+FZ4qy88txV6g6AMpYkXsCam7e1QuA0vzFtdfgyy0FCuMro9X0E7N2w7Ldx/FV4XzjA4Ma3tjMX8sCAPoumVeBi4nNrwAg8jNL+6vdSyRJsuWzP4/Pkt28ADBny8Odp8+huPoaLPy2UAcCVC7VNz2EBy+4ASi5dAsmZu3SMX/mujzYebIGqm7eNdmiV502AHf4AeCxcBtrva8ZETjs+kVaW9pfHUIOPvEtpJtT9Z+y2mAAzLXodf/5Szhacw0WbNEEoQKXQ9wAoLJH3fzT1+bBrlO1cL6xxeSLXnVa2Z8vAH3HLdWb9ZXmt3ELb7G0rzqMHLzji0l3Zfswco7xAJgg+zNNe957/gpfEbJyT0DO8Rq4//yVXgDqmx7A+oOnYd6WAsg5VQvfNT4wS8sDU/av5QlA97CpZOYXR6D6v8DSvuowcvSJ/5J0S0JRYApElF7hDUBbtDyoD3xxvFBEqp4xQFu0PDBl/1oeAISXXgaBTyyR+VsBmGtpX3UYCbwTRvLZjzNkz2nDATBDw5v2tKe6+XkBYKaGN7bsX8MDgKE5p4iM/ybCQyztqw4jR8+ELnz24/T6aicvACyZ/Vv0AGDJ7F/DAwD3eVt4mD8C7NylQkv7qiPpdwKf+CekuzB/kvSVYQAwZP97//wJ6m7ehVsPfoTHL16bPPtzAWCO+3zrGlug9GoD5FdfhbM3mzmzfw0PAD6KmUtsfmu38CfonFraVB1KDt5xx0m3IBcNTNMZB7ABoM/8C7YUqNodUF8Q6vfZUlAOB8vqofziD3D70b+IGt7Ysr85ASi/0Qz7zlyATQXlsGT3cZj1zUEYv3w3bonIWJYDU9bsVUFQawQA4aj+940jMj8GQBxx1NJ+6nBy8I6fxmf//ZDcUmx8VY1qAADnf7jH0u+j2fKwZHsx7D5RA2WXG6Dh8TNe2Z8IAELzn/2+GfafvQhrDpTCzA0HWJvglACgyK+9xmr+GkIA3tT/3MZXq/8nW9pPHU6Okrg+fPbf91ywVfMkcQHAMvBFW5uszythbXjTDuUC19q8Ejj13U1o/tfPes1vLABop7fc0xdgwbYiGL98F6fptc3/5dYiqGloMRoA9y+yeZg/Aqxcwz+2tJ86njIzfy/wirtHCkDP8BlGAaA+6G1++hy+u30fm3r/6fOw+XA5fL29mLXnRxlzNh6ErUXnoPr7ZmgxFAAG86NsX1B9FVbuOwUTVyhKGq6YseEAfJ1zDDYWlMOu0jooqLsO5d83cZY+NTwA6Bo6mcz8brj+v9+pU+bvLW2nDikH77itfB4+MfLgOf0AGLDopbzZ5c6TZ1BxpQFyT9TC1zuOMEKAInNtHizPOQ6lF25pGF8vAFp7/FxoeoiNjxbFuHr90Wpx1p6TkFt6Hsqu3+E981PDA4CRB862Ln6RmB+FbIulfdRh5eAZJ+XzvC2vhduIACA3P/fMD5opKq6+Cst3HdcBQBnLdx+HimtNcP+n19j891+85gRAZfwqTeNrAzBn82HYjsYh1+7wbnhjM381AQAe87N5mD8cbYMSZmkfdVgJxPGdHbzjfiV96soH4TNNDIDurY5s056Xmh7B3pLzuItTHQBlrNpbAk0//qwXgNqG+7BwaxFjv/+0tXmwMb8c3+9r7KJXLYP5qwkA6Kav/FEzv7Vb+K/2rqOtLO2jDi2BV9xZ4kcOecdBaH4VJwDmXPRCcRc1wtVehy+zdUE4c7mBEwCU/Q9VXNIxPrqrK6ekFuoaH5h00auGJwCc5Y/K+Crzg5WbrNzS/unwcvCOTebzvK0BczabDABjFr3uPnsFRdXXYH4rCOje3astT1kBiG0F4My1Rpi0Mldh/DWKFmgd45sp+1frAcAlcy1J1n8DgGt4oqX90+ElkiS9I/COe0n6vC3n4HQIL7lMBIC5Wx5QND97hdugr7WaXx8AKMquNUJ+1RVsfHO1PPAFIPzkZXAMTCQ3v5vspZVY/ndL++etkMArdj+f520FrDlgNACmaHlQD6X5SQAwd8Mbm/mr7zxgBcBv5V5i87fGXkv75q2RvXdcCJ+HzfWK/kIvAG2R/ZnMbzoATJ/9qzkA6CnL5Kz3taOzW/gQS/vmrZFALPuzvXfMY+KHzXnHgv+q/cQAmKPhjQ2Ae3oAMPTBFqbI/lUsAPityCPN+sry56FIkvTvlvbNWyV7r9jVfJ6y+EnCAlYAjMn+D43M/qYEwNTZv4oFgI/k84jNrxj8ylZY2i9vnQRecd0EXrG/kj5ilO0BGU8tnP25ADBl9jfE/FUsAAg8Y4jNj+b+O7tEdLe0X95K2XvGHiJ/uHQ8TwD47e/J1/x8AfjOAtm/iikUMssAAAtVSURBVAUAO3c5qflR9t9vaZ+8tRJ4xgwgMb/iyYv6ATBn9mczv8EAtEH2r2IFYCyR+RX1f7irpX3yVsveM7acy/go7D35AkDe8mBs9r/3k34A2jL7V5kSAFdZhaX98dbLzitmuD7zkwBgqeyPAEjhC4ABO7wZkv2rGo0DgE59toVCQv4g8JRfYzM+fwDaNvvrA8CcLQ/6sn+lUQBIb9DHH7WRHDzlMi7z6wPA2IY3vtOe6gDcNQiAtsn+lQYDIIPOLrIxbXX+qdDdYp7ySjbzKwCIYzyZKNu31bQnU/bnAqCtGt50sn+jwvznGlqYAfCI5jS/lau0ht71ZYEZITbz23vK8Wow08m8fu+JRbM/fwDMO+1ZpQZAcf0txu8MPQibzfzWrjKwdpF50qxsAdl5yA8wmR+HVwzjyVy995RFsv9dPQDEaANgxoY3JvNXNj6AOVvydb+zwAzl3j66xleYfx81v4Uk8JF3tfOMealj/tZwZnhY9scjpuL7es3d8HbPJAC0XfbPLbsIvUKm6ByX0C+Fy/yv6KqvhWXvEbNS2/jKcJQwt0N8MGwS3sHhaPVV/OijosorcKCsHu/1s+lQGWw8eAa+LayAXSdqYH9ZPRRUXoGK63eg8clPRmd/IgCMyP5laK+gc5ch+2gVbCg8CysPlMKS3BOwcMcRWLTzCKw8UALrC8/C5qOVsPv0BdhyrBoylu+C94dOZPyu0JoLo/lxSJdZ+vz/5iUQy/7L3nNsIxsEzgFpjCfW0OgbOh0Gpi6B+PnZsCL3JBw7/z3c+fEFcfYnB4Db/JW370FOaR18kZ0P4TM3gCRxIfRmeTi4oSEKSEW7ujGa38pF1mTvEvrfv3kDtgfZeciD2ABQzAalm9QY2tFj8AQYkrEUFm8vhsrvmznN36wPAI5pz4KaazBj40EITFkM3YMnmPUzdQlKb5390c76rQD0lw629HmnUpOdh3yrDgAeikDbK6LBnHkN8yZ8ExbA/Ox8qG96ZBQAyPQnLt6CaWv3gWfs/DY7/i6B6WDvEcNqfmtXutdPu5O1Z8L/2HnK72qbXxFjcS0rMnE5pC+6D54AiQu2wqmLt1Xm5wRAzfz7yi5A1OyN0M3smT5DI0T+qWDrzpH5XaTNtp9G/c3S55uKQXbuYwcymd9OLdAKsdAvGZwDNWHoNnQS9BgxDT4YM1MV3UKmQPdhk01irJGTV8LJi7f1AoCMP3jcUtMAOGwydB8+ReMzoc+IPqv6zzkHpoGTbyJOHMyD3Vbzu8pov097l73H2G1s5ucK36w9rA+DRtuBhxZUg8e8LeDQ+hR7BUT8xhZdB46D1MU7QJq5TheQKasgZt5m/DN83hMdAzoW/EBB33jwmPsthObX4GNm+zzeX+dwL2y5spjfRbrV0ueXSo/eEcf/1c49up6P+VEgYNBuEmymUUbwliPgKEnAZQJaIcUDbZ84EPonm32wjaPV8Kiks3OPVt2rK/COgYGbCvQev//6g/i5vrzN7yq78re+o/+TGrADyNo98j1b9+inxAC4R+NAq8cDvynUa6KhOSXgGJiMAcAxoDXco/Gsk9A/xeTGR4Ch3iemndkEfvEwZPtxvcc9cHMh2HowtTXIWI2Pw0X247v9pT0sfV6peMjOM2oEH/MrA5URQ3YwPxZUPYbvKwPnIRlvzK8V6MoglCQbN/sUmAFOkiQ8Hcm2F6fz4DQYsa9c/5Xr2yNg5zmWv/ldZfCum3Q4NV8HlK179BJ282saXwMCvwQYtrtEr6nCiuvgw+jZrBBgEDzGghMCgW/G90NXGHbjo/gwahY+Bv1XrFO4ROJT8lipsr90kaXPI5WhEmf+0dZ97Cl9WZ8pHPwSYPC2o3rNFVF6GVw+X6sYE+gAEKkKgZccr6zqMz76GXT14NyBeUAk9J+2hnOgq4zB24+DQBJnkPk7u0hPd+ot/xM1YAdWZ5eId+w8xl7mY37FADcaPwg6aKP+gSUeXK7Owy3YTOa3UUUULmnYzI96l/Q9fELgEwMBaw4SHVPA+kMMvfwEWd8V3+By7f97RL1r6fNHZQLZe0Y42XpEN/Mxv3KWB0Hjs2w3keFGHjyLtxBkNv+bR4rae8ZqTKGi/0bdrPoePNF99FQYkXeW6FgkK/aCjXukQea3cpE1vSuWOVDzvUWydZO/b+se/ZjM+Arzq8IjWuchfGwRXnIJxLM3gp1nNKP5lYGuEgLveLzjNQaFw/ho5mbAnE1EJQ8K93nZak1sPOp9VxxPrd3GfGTp80VlBtmIowbYDoh6wcv8atOcfVIXg/TERSITDssthW4jJzGan/T5uijeGzYehu48SfQ3ZScuQd/0rw0b7Lriuf6frdzCvan53mLZiiOD7QZEvyYyP8OsTrfQqTDy0JuH8bHGmWsQfuoyeC7cjscGfI1v7zkWxLM2gAwBd+aa3r8XeqgSuo2ebFjJ44rv6/2ls0t4iKXPD1UbyNY9KgJBQJL1mcLRPwkGZRczmP4qjD13E+S1DRBT2wjy6gaIKr8BoYeqoE/aYmLz94qZix9HhH4XvQd6LxTR526xzvE7BCQYbn4X2evO/aVSar7fkKzdo4fbuEe95Gt+ZaAaHz0xUb0uH3vulsqs6jG2UmHcoA354Dw0nX1Ra2iGYtYJgVTJ/F7Rre+Fxxull2HAF5u1Wht41ftg5Sp92dlFOszS54PKArIZEBlg4x71E1/zq8/y9BjzOYzYfxaXKUyGVUVNA0SfuwkRpVdw4x1awVUaXzgwBTwXbsOPIYquuIl/lv29GvDfGnmoAnrIphtc77fO87+wcgkLpub7rQ+M3SN/JDM+8/y+g28cDNpcyA2AWsirb0P02ZsQsuc0DvTf6DXS3w/aVAD23nIj6n004JU+s3ILowNeKjQmiHSzEUc9JTU+0/z+eyMmEhvY2Hhv+ASjzG/lIn1i5SLrT889lUrWntFdbMVRlw0xP17c8orRGLCaK+Q1t8HWM9rAeh/FmOudXUbTB1hQ6crWJ+pvtgOijvE1vzJCckvNDgBaEzDU/J1dpSWoNYSeeyp2iTP/aCOOzGLv52E2P4rPJmaZHYC+45byL3kU5l9LG9uoiGXjHiG3HRDxSl/WV1/csnOPglGHzpnN/KMOVYKNewTPel/22spFOpGeeiresh4Q6Wk9IKKJxPzK6CGdxroeYEygKdTuo6fwLHnG3HnXNcyDnnoqg2Ullv/dZkDEfj79PL1ivjApBPLKH6BX7Fx+5neRFrwjlnWmp57KJLJxi5DaiCOekfbz9AzPhLCiWqPNP7qwFi+28TD+T1Zu0pROnTr9jp56KpMK7YRsLY6oI+nnwQ1tXnIQz9kEspMXeRsfNcGJ52xU3NBCPNiV1tv0D/uQnnYqs8n205C/2IgjvrJxC3/FCYDqwdIR+MaUjxO+xPvxoBvYUZObtuEjy6/jG+3Rz3wUPw9sxZF8mtleWblIFwjEsj/TU0/VJrJxj/jQ2i28nNv87M/VQlA4BiTi0Lxzi3c/T1XnfmM+oaedygLK/L2NW4TcRhzxlI/5uZ63RZ71pU9wrR8S8gd66qksKntXuZW1W0R2m5nfVXbA2jXcjp52qnYldDuhtZusyhTGZzF/JX0gHVV71+9sxOEhVq6ya6Yzv/SWlYtMTh9FStVh1Lu3/E9WbjK5tWt4s6ElT2cXWQtqYxBJkv7d0p+Hisog/U+/yP9r7Sabbu0qayE3v/R+Z1fptHfEIX+lXzvVWyGUxW3cpFIrV9kVVvO7SG+imR2r3vL/sPTxUlGZSZm/t+4fHmTlIjurNH9nV2kt3pVBLP4j/dqpfluzRi5jvCx9HFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVJ06rv4XwQ3Jejj7+ycAAAAASUVORK5CYII="
)


def _format_duration(total_minutes):
    if not total_minutes:
        return 'Self-paced'
    if total_minutes < 60:
        return '< 1 Hour'
    hours = round(total_minutes / 60)
    return f'{hours} Hour{"s" if hours != 1 else ""}'


def _certificate_html(certificate):
    learner_name = escape(certificate.user.name or certificate.user.matricule)
    course_title = escape(certificate.course.title)
    tier_label = escape(certificate.get_tier_display()).upper()
    verification_id = escape(certificate.verification_id)
    duration_label = escape(_format_duration(certificate.course.duration_minutes))
    issued_date = certificate.issued_at or timezone.now()
    # "%-d" (no zero-padding) is a glibc/Linux-only strftime extension, not
    # portable -- built by hand instead so "September 9, 2026" renders the
    # same on every platform this might ever run on.
    issued_at = f'{issued_date.strftime("%B")} {issued_date.day}, {issued_date.year}'

    # Enough diagonal watermark lines to visibly tile across an A4-landscape
    # card at a -28deg tilt, regardless of exact page size. Renders
    # correctly under WeasyPrint (this module's Dockerfile now installs its
    # real dependencies); see module docstring for the xhtml2pdf fallback
    # caveat.
    watermark_lines = '\n'.join(
        '<div class="watermark-line">' + ' &nbsp;&nbsp;&nbsp; '.join(['PRINTED BY EDUIGNITE ACADEMY'] * 4) + '</div>'
        for _ in range(7)
    )

    return f'''<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  html, body {{
    height: 100%;
    margin: 0;
    padding: 0;
    background: #FBF9F4;
    font-family: Georgia, "Times New Roman", serif;
  }}
  .cert {{
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    /* height:100% of the now-explicitly-sized html/body, not 100vh --
       "vh" is ambiguous in a print @page context and renders
       inconsistently across preview tools/engines; an explicit ancestor
       height makes percentage sizing (and therefore flex centering)
       unambiguous everywhere. */
    width: 100%;
    height: 100%;
    overflow: hidden;
    padding: 44px 64px 40px;
    background: #FBF9F4;
    text-align: center;
  }}
  .watermark {{
    position: absolute;
    top: -20%;
    left: -20%;
    width: 140%;
    height: 160%;
    transform: rotate(-28deg);
    z-index: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
  }}
  .watermark-line {{
    white-space: nowrap;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 15px;
    font-weight: bold;
    letter-spacing: 3px;
    color: #12314D;
    opacity: 0.07;
  }}
  .content {{
    position: relative;
    z-index: 1;
  }}
  .shield {{
    width: 56px;
    height: 56px;
    margin: 0 auto;
  }}
  .brand {{
    margin-top: 14px;
    color: #1A2B4C;
    font-size: 26px;
    font-weight: bold;
    letter-spacing: 4px;
  }}
  .tagline {{
    margin-top: 4px;
    color: #A6813D;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
  }}
  .rule {{
    width: 90px;
    height: 1px;
    background: #D9CFB8;
    margin: 22px auto;
  }}
  h1 {{
    margin: 0;
    color: #A6813D;
    font-size: 38px;
    letter-spacing: 4px;
    font-weight: normal;
  }}
  .presented {{
    margin-top: 34px;
    color: #64748b;
    font-style: italic;
    font-size: 14px;
  }}
  .learner-name {{
    margin-top: 12px;
    font-size: 32px;
    font-weight: bold;
    color: #1A2B4C;
  }}
  .for-course {{
    margin-top: 22px;
    color: #64748b;
    font-style: italic;
    font-size: 14px;
  }}
  .course-title {{
    margin-top: 10px;
    font-size: 22px;
    font-weight: bold;
    color: #1A2B4C;
  }}
  .footer {{
    margin-top: 48px;
    width: 100%;
    border-collapse: collapse;
    padding-top: 22px;
    border-top: 1px solid #E7E0D0;
    font-family: Arial, Helvetica, sans-serif;
  }}
  .footer td {{
    width: 25%;
    text-align: center;
    vertical-align: top;
    padding-top: 22px;
  }}
  .footer .label {{
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #94a3b8;
    font-size: 9px;
    font-weight: bold;
  }}
  .footer .value {{
    margin-top: 6px;
    font-weight: bold;
    color: #1A2B4C;
    font-size: 12px;
  }}
</style>
</head>
<body>
  <div class="cert">
    <div class="watermark">{watermark_lines}</div>
    <div class="content">
      <img class="shield" src="data:image/png;base64,{_SHIELD_PNG_B64}" alt="EduIgnite" />
      <p class="brand">EDUIGNITE ACADEMY</p>
      <p class="tagline">Professional Learning &amp; Certification</p>
      <div class="rule"></div>
      <h1>{tier_label}</h1>
      <div class="rule"></div>
      <p class="presented">This certificate is proudly presented to</p>
      <p class="learner-name">{learner_name}</p>
      <p class="for-course">For successfully completing</p>
      <p class="course-title">{course_title}</p>
      <table class="footer">
        <tr>
          <td>
            <div class="label">Presented By</div>
            <div class="value">EduIgnite Academy Team</div>
          </td>
          <td>
            <div class="label">Duration</div>
            <div class="value">{duration_label}</div>
          </td>
          <td>
            <div class="label">Date</div>
            <div class="value">{issued_at}</div>
          </td>
          <td>
            <div class="label">Credential ID</div>
            <div class="value">{verification_id}</div>
          </td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>'''


def build_certificate_pdf_response(certificate):
    """Return an ``HttpResponse`` carrying the certificate as a downloadable
    PDF attachment."""
    from apps.ai_features.pdf_utils import render_html_to_pdf

    html = _certificate_html(certificate)
    pdf = render_html_to_pdf(html, base_url=getattr(settings, 'WEASYPRINT_BASEURL', None))
    response = HttpResponse(pdf, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="EduIgnite-Certificate-{certificate.verification_id}.pdf"'
    return response
