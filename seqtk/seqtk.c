/* The MIT License

   Copyright (c) 2008-2016 Broad Institute

   Permission is hereby granted, free of charge, to any person obtaining
   a copy of this software and associated documentation files (the
   "Software"), to deal in the Software without restriction, including
   without limitation the rights to use, copy, modify, merge, publish,
   distribute, sublicense, and/or sell copies of the Software, and to
   permit persons to whom the Software is furnished to do so, subject to
   the following conditions:

   The above copyright notice and this permission notice shall be
   included in all copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
   EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
   BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
   ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
   CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
*/

#include <stdio.h>
#include <ctype.h>
#include <stdlib.h>
#include <stdint.h>
#include <inttypes.h>
#include <zlib.h>
#include <string.h>
#include <unistd.h>
#include <limits.h>
#include <assert.h>
#include <math.h>

#include "kseq.h"
KSEQ_INIT(gzFile, gzread)

typedef struct {
	int n, m;
	uint64_t *a;
} reglist_t;

#include "khash.h"
KHASH_MAP_INIT_STR(reg, reglist_t)
KHASH_SET_INIT_INT64(64)

typedef kh_reg_t reghash_t;

reghash_t *stk_reg_read(const char *fn)
{
	reghash_t *h = kh_init(reg);
	gzFile fp;
	kstream_t *ks;
	int dret;
	kstring_t *str;
	// read the list
	fp = strcmp(fn, "-")? gzopen(fn, "r") : gzdopen(fileno(stdin), "r");
	if (fp == 0) return 0;
	ks = ks_init(fp);
	str = calloc(1, sizeof(kstring_t));
	while (ks_getuntil(ks, 0, str, &dret) >= 0) {
		int beg = -1, end = -1;
		reglist_t *p;
		khint_t k = kh_get(reg, h, str->s);
		if (k == kh_end(h)) {
			int ret;
			char *s = strdup(str->s);
			k = kh_put(reg, h, s, &ret);
			memset(&kh_val(h, k), 0, sizeof(reglist_t));
		}
		p = &kh_val(h, k);
		if (dret != '\n') {
			if (ks_getuntil(ks, 0, str, &dret) > 0 && isdigit(str->s[0])) {
				beg = atoi(str->s);
				if (dret != '\n') {
					if (ks_getuntil(ks, 0, str, &dret) > 0 && isdigit(str->s[0])) {
						end = atoi(str->s);
						if (end < 0) end = -1;
					}
				}
			}
		}
		// skip the rest of the line
		if (dret != '\n') while ((dret = ks_getc(ks)) > 0 && dret != '\n');
		if (end < 0 && beg > 0) end = beg, beg = beg - 1; // if there is only one column
		if (beg < 0) beg = 0, end = INT_MAX;
		if (p->n == p->m) {
			p->m = p->m? p->m<<1 : 4;
			p->a = realloc(p->a, p->m * 8);
		}
		p->a[p->n++] = (uint64_t)beg<<32 | end;
	}
	ks_destroy(ks);
	gzclose(fp);
	free(str->s); free(str);
	return h;
}

void stk_reg_destroy(reghash_t *h)
{
	khint_t k;
	if (h == 0) return;
	for (k = 0; k < kh_end(h); ++k) {
		if (kh_exist(h, k)) {
			free(kh_val(h, k).a);
			free((char*)kh_key(h, k));
		}
	}
	kh_destroy(reg, h);
}

/* constant table */

unsigned char seq_nt16_table[256] = {
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15 /*'-'*/,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15, 1,14, 2, 13,15,15, 4, 11,15,15,12, 15, 3,15,15,
	15,15, 5, 6,  8,15, 7, 9,  0,10,15,15, 15,15,15,15,
	15, 1,14, 2, 13,15,15, 4, 11,15,15,12, 15, 3,15,15,
	15,15, 5, 6,  8,15, 7, 9,  0,10,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15,
	15,15,15,15, 15,15,15,15, 15,15,15,15, 15,15,15,15
};

unsigned char seq_nt6_table[256] = {
    0, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 1, 5, 2,  5, 5, 5, 3,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  4, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 1, 5, 2,  5, 5, 5, 3,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  4, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,

    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,
    5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5,  5, 5, 5, 5
};

char *seq_nt16_rev_table = "XACMGRSVTWYHKDBN";
unsigned char seq_nt16to4_table[] = { 4, 0, 1, 4, 2, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4 };
unsigned char seq_nt16comp_table[] = { 0, 8, 4, 12, 2, 10, 9, 14, 1, 6, 5, 13, 3, 11, 7, 15 };
int bitcnt_table[] = { 4, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4 };
char comp_tab[] = {
	  0,   1,	2,	 3,	  4,   5,	6,	 7,	  8,   9,  10,	11,	 12,  13,  14,	15,
	 16,  17,  18,	19,	 20,  21,  22,	23,	 24,  25,  26,	27,	 28,  29,  30,	31,
	 32,  33,  34,	35,	 36,  37,  38,	39,	 40,  41,  42,	43,	 44,  45,  46,	47,
	 48,  49,  50,	51,	 52,  53,  54,	55,	 56,  57,  58,	59,	 60,  61,  62,	63,
	 64, 'T', 'V', 'G', 'H', 'E', 'F', 'C', 'D', 'I', 'J', 'M', 'L', 'K', 'N', 'O',
	'P', 'Q', 'Y', 'S', 'A', 'A', 'B', 'W', 'X', 'R', 'Z',	91,	 92,  93,  94,	95,
	 64, 't', 'v', 'g', 'h', 'e', 'f', 'c', 'd', 'i', 'j', 'm', 'l', 'k', 'n', 'o',
	'p', 'q', 'y', 's', 'a', 'a', 'b', 'w', 'x', 'r', 'z', 123, 124, 125, 126, 127
};

static void stk_printstr(const kstring_t *s, unsigned line_len)
{
	if (line_len != UINT_MAX && line_len != 0) {
		int i, rest = s->l;
		for (i = 0; i < s->l; i += line_len, rest -= line_len) {
			putchar('\n');
			if (rest > line_len) fwrite(s->s + i, 1, line_len, stdout);
			else fwrite(s->s + i, 1, rest, stdout);
		}
		putchar('\n');
	} else {
		putchar('\n');
		puts(s->s);
	}
}

static inline void stk_printseq_renamed(const kseq_t *s, int line_len, const char *prefix, int64_t n)
{
	putchar(s->qual.l? '@' : '>');
	if (n >= 0) {
		if (prefix) fputs(prefix, stdout);
		printf("%lld", (long long)n);
	} else fputs(s->name.s, stdout);
	if (s->comment.l) {
		putchar(' '); fputs(s->comment.s, stdout);
	}
	stk_printstr(&s->seq, line_len);
	if (s->qual.l) {
		putchar('+');
		stk_printstr(&s->qual, line_len);
	}
}

static inline void stk_printseq(const kseq_t *s, int line_len)
{
	stk_printseq_renamed(s, line_len, 0, -1);
}

/* 
   64-bit Mersenne Twister pseudorandom number generator. Adapted from:

     http://www.math.sci.hiroshima-u.ac.jp/~m-mat/MT/VERSIONS/C-LANG/mt19937-64.c

   which was written by Takuji Nishimura and Makoto Matsumoto and released
   under the 3-clause BSD license.
*/

typedef uint64_t krint64_t;

struct _krand_t;
typedef struct _krand_t krand_t;

#define KR_NN 312
#define KR_MM 156
#define KR_UM 0xFFFFFFFF80000000ULL /* Most significant 33 bits */
#define KR_LM 0x7FFFFFFFULL /* Least significant 31 bits */

struct _krand_t {
	int mti;
	krint64_t mt[KR_NN];
};

static void kr_srand0(krint64_t seed, krand_t *kr)
{
	kr->mt[0] = seed;
	for (kr->mti = 1; kr->mti < KR_NN; ++kr->mti) 
		kr->mt[kr->mti] = 6364136223846793005ULL * (kr->mt[kr->mti - 1] ^ (kr->mt[kr->mti - 1] >> 62)) + kr->mti;
}

krand_t *kr_srand(krint64_t seed)
{
	krand_t *kr;
	kr = malloc(sizeof(krand_t));
	kr_srand0(seed, kr);
	return kr;
}

krint64_t kr_rand(krand_t *kr)
{
	krint64_t x;
	static const krint64_t mag01[2] = { 0, 0xB5026F5AA96619E9ULL };
    if (kr->mti >= KR_NN) {
		int i;
		if (kr->mti == KR_NN + 1) kr_srand0(5489ULL, kr);
        for (i = 0; i < KR_NN - KR_MM; ++i) {
            x = (kr->mt[i] & KR_UM) | (kr->mt[i+1] & KR_LM);
            kr->mt[i] = kr->mt[i + KR_MM] ^ (x>>1) ^ mag01[(int)(x&1)];
        }
        for (; i < KR_NN - 1; ++i) {
            x = (kr->mt[i] & KR_UM) | (kr->mt[i+1] & KR_LM);
            kr->mt[i] = kr->mt[i + (KR_MM - KR_NN)] ^ (x>>1) ^ mag01[(int)(x&1)];
        }
        x = (kr->mt[KR_NN - 1] & KR_UM) | (kr->mt[0] & KR_LM);
        kr->mt[KR_NN - 1] = kr->mt[KR_MM - 1] ^ (x>>1) ^ mag01[(int)(x&1)];
        kr->mti = 0;
    }
    x = kr->mt[kr->mti++];
    x ^= (x >> 29) & 0x5555555555555555ULL;
    x ^= (x << 17) & 0x71D67FFFEDA60000ULL;
    x ^= (x << 37) & 0xFFF7EEE000000000ULL;
    x ^= (x >> 43);
    return x;
}

#define kr_drand(_kr) ((kr_rand(_kr) >> 11) * (1.0/9007199254740992.0))


/* composition */
int stk_comp(int argc, char *argv[])
{
	gzFile fp;
	kseq_t *seq;
	int l, c, upper_only = 0;
	reghash_t *h = 0;
	reglist_t dummy;

	while ((c = getopt(argc, argv, "ur:")) >= 0) {
		switch (c) {
			case 'u': upper_only = 1; break;
			case 'r': h = stk_reg_read(optarg); break;
		}
	}
	if (argc == optind && isatty(fileno(stdin))) {
		fprintf(stderr, "Usage:  seqtk comp [-u] [-r in.bed] <in.fa>\n\n");
		fprintf(stderr, "Output format: chr, length, #A, #C, #G, #T, #2, #3, #4, #CpG, #tv, #ts, #CpG-ts\n");
		return 1;
	}
	fp = optind < argc && strcmp(argv[optind], "-")? gzopen(argv[optind], "r") : gzdopen(fileno(stdin), "r");
	if (fp == 0) {
		fprintf(stderr, "[E::%s] failed to open the input file/stream.\n", __func__);
		return 1;
	}
	seq = kseq_init(fp);
	dummy.n= dummy.m = 1; dummy.a = calloc(1, 8);
	while ((l = kseq_read(seq)) >= 0) {
		int i, k;
		reglist_t *p = 0;
		if (h) {
			khint_t k = kh_get(reg, h, seq->name.s);
			if (k != kh_end(h)) p = &kh_val(h, k);
		} else {
			p = &dummy;
			dummy.a[0] = l;
		}
		for (k = 0; p && k < p->n; ++k) {
			int beg = p->a[k]>>32, end = p->a[k]&0xffffffff;
			int la, lb, lc, na, nb, nc, cnt[11];
			if (beg > 0) la = seq->seq.s[beg-1], lb = seq_nt16_table[la], lc = bitcnt_table[lb];
			else la = 'a', lb = -1, lc = 0;
			na = seq->seq.s[beg]; nb = seq_nt16_table[na]; nc = bitcnt_table[nb];
			memset(cnt, 0, 11 * sizeof(int));
			for (i = beg; i < end; ++i) {
				int is_CpG = 0, a, b, c;
				a = na; b = nb; c = nc;
				na = seq->seq.s[i+1]; nb = seq_nt16_table[na]; nc = bitcnt_table[nb];
				if (b == 2 || b == 10) { // C or Y
					if (nb == 4 || nb == 5) is_CpG = 1;
				} else if (b == 4 || b == 5) { // G or R
					if (lb == 2 || lb == 10) is_CpG = 1;
				}
				if (upper_only == 0 || isupper(a)) {
					if (c > 1) ++cnt[c+2];
					if (c == 1) ++cnt[seq_nt16to4_table[b]];
					if (b == 10 || b == 5) ++cnt[9];
					else if (c == 2) {
						++cnt[8];
					}
					if (is_CpG) {
						++cnt[7];
						if (b == 10 || b == 5) ++cnt[10];
					}
				}
				la = a; lb = b; lc = c;
			}
			if (h) printf("%s\t%d\t%d", seq->name.s, beg, end);
			else printf("%s\t%d", seq->name.s, l);
			for (i = 0; i < 11; ++i) printf("\t%d", cnt[i]);
			putchar('\n');
		}
		fflush(stdout);
	}
	free(dummy.a);
	kseq_destroy(seq);
	gzclose(fp);
	return 0;
}

static void print_seq(FILE *fpout, const kseq_t *ks, int begin, int end)
{
	int i;
	if (begin >= end) return; // FIXME: why may this happen? Understand it!
	fprintf(fpout, "%c%s:%d-%d", ks->qual.l? '@' : '>', ks->name.s, begin+1, end);
	for (i = begin; i < end && i < ks->seq.l; ++i) {
		if ((i - begin)%60 == 0) fputc('\n', fpout);
		fputc(ks->seq.s[i], fpout);
	}
	fputc('\n', fpout);
	if (ks->qual.l == 0) return;
	fputs("+\n", fpout);
	for (i = begin; i < end && i < ks->qual.l; ++i) {
		if ((i - begin)%60 == 0) fputc('\n', fpout);
		fputc(ks->qual.s[i], fpout);
	}
	fputc('\n', fpout);
}

/* fqchk */

typedef struct {
	int64_t q[94], b[5];
} posstat_t;

static void fqc_aux(posstat_t *p, int pos, int64_t allq[94], double perr[94], int qthres)
{
	int k;
	int64_t sum = 0, qsum = 0, sum_low = 0;
	double psum = 0;
	if (pos <= 0) printf("ALL");
	else printf("%d", pos);
	for (k = 0; k <= 4; ++k) sum += p->b[k];
	printf("\t%lld", (long long)sum);
	for (k = 0; k <= 4; ++k)
		printf("\t%.1f", 100. * p->b[k] / sum);
	for (k = 0; k <= 93; ++k) {
		qsum += p->q[k] * k, psum += p->q[k] * perr[k];
		if (k < qthres) sum_low += p->q[k];
	}
	printf("\t%.1f\t%.1f", (double)qsum/sum, -4.343*log((psum+1e-6)/(sum+1e-6)));
	if (qthres <= 0) {
		for (k = 0; k <= 93; ++k)
			if (allq[k] > 0) printf("\t%.2f", 100. * p->q[k] / sum);
	} else printf("\t%.1f\t%.1f", 100. * sum_low / sum, 100. * (sum - sum_low) / sum);
	putchar('\n');
}

int stk_fqchk(int argc, char *argv[])
{
	gzFile fp;
	kseq_t *seq;
	int i, c, k, max_len = 0, min_len = 0x7fffffff, max_alloc = 0, offset = 33, n_diffQ = 0, qthres = 20;
	int64_t tot_len = 0, n = 0;
	double perr[94];
	posstat_t all, *pos = 0;

	while ((c = getopt(argc, argv, "q:")) >= 0)
		if (c == 'q') qthres = atoi(optarg);

	if (optind == argc) {
		fprintf(stderr, "Usage: seqtk fqchk [-q %d] <in.fq>\n", qthres);
		fprintf(stderr, "Note: use -q0 to get the distribution of all quality values\n");
		return 1;
	}
	fp = (strcmp(argv[optind], "-") == 0)? gzdopen(fileno(stdin), "r") : gzopen(argv[optind], "r");
	if (fp == 0) {
		fprintf(stderr, "[E::%s] failed to open the input file/stream.\n", __func__);
		return 1;
	}
	seq = kseq_init(fp);
	for (k = 0; k <= 93; ++k)
		perr[k] = pow(10., -.1 * k);
	perr[0] = perr[1] = perr[2] = perr[3] = .5;
	while (kseq_read(seq) >= 0) {
		if (seq->qual.l == 0) continue;
		++n;
		tot_len += seq->seq.l;
		min_len = min_len < seq->seq.l? min_len : seq->seq.l;
		max_len = max_len > seq->seq.l? max_len : seq->seq.l;
		if (max_len > max_alloc) {
			int old_max = max_alloc;
			max_alloc = max_len;
			kroundup32(max_alloc);
			pos = realloc(pos, max_alloc * sizeof(posstat_t));
			memset(&pos[old_max], 0, (max_alloc - old_max) * sizeof(posstat_t));
		}
		for (i = 0; i < seq->qual.l; ++i) {
			int q = seq->qual.s[i] - offset;
			int b = seq_nt6_table[(int)seq->seq.s[i]];
			b = b? b - 1 : 4;
			q = q < 93? q : 93;
			++pos[i].q[q];
			++pos[i].b[b];
		}
	}
	kseq_destroy(seq);
	gzclose(fp);

	memset(&all, 0, sizeof(posstat_t));
	for (i = 0; i < max_len; ++i) {
		for (k = 0; k <= 93; ++k)
			all.q[k] += pos[i].q[k];
		for (k = 0; k <= 4; ++k)
			all.b[k] += pos[i].b[k];
	}
	for (k = n_diffQ = 0; k <= 93; ++k)
		if (all.q[k]) ++n_diffQ;
	printf("min_len: %d; max_len: %d; avg_len: %.2f; %d distinct quality values\n", min_len, max_len, (double)tot_len/n, n_diffQ);
	printf("POS\t#bases\t%%A\t%%C\t%%G\t%%T\t%%N\tavgQ\terrQ");
	if (qthres <= 0) {
		for (k = 0; k <= 93; ++k)
			if (all.q[k] > 0) printf("\t%%Q%d", k);
	} else printf("\t%%low\t%%high");
	putchar('\n');
	fqc_aux(&all, 0, all.q, perr, qthres);
	for (i = 0; i < max_len; ++i)
		fqc_aux(&pos[i], i + 1, all.q, perr, qthres);
	free(pos);
	return 0;
}

/* main function */
static int usage()
{
	fprintf(stderr, "\n");
	fprintf(stderr, "Usage:   seqtk <command> <arguments>\n");
	fprintf(stderr, "Version: 1.3-r106\n\n");
	fprintf(stderr, "Command: seq       common transformation of FASTA/Q\n");
	fprintf(stderr, "         comp      get the nucleotide composition of FASTA/Q\n");
	fprintf(stderr, "         sample    subsample sequences\n");
	fprintf(stderr, "         subseq    extract subsequences from FASTA/Q\n");
	fprintf(stderr, "         fqchk     fastq QC (base/quality summary)\n");
	fprintf(stderr, "         mergepe   interleave two PE FASTA/Q files\n");
	fprintf(stderr, "         trimfq    trim FASTQ using the Phred algorithm\n\n");
	fprintf(stderr, "         hety      regional heterozygosity\n");
	fprintf(stderr, "         gc        identify high- or low-GC regions\n");
	fprintf(stderr, "         mutfa     point mutate FASTA at specified positions\n");
	fprintf(stderr, "         mergefa   merge two FASTA/Q files\n");
	fprintf(stderr, "         famask    apply a X-coded FASTA to a source FASTA\n");
	fprintf(stderr, "         dropse    drop unpaired from interleaved PE FASTA/Q\n");
	fprintf(stderr, "         rename    rename sequence names\n");
	fprintf(stderr, "         randbase  choose a random base from hets\n");
	fprintf(stderr, "         cutN      cut sequence at long N\n");
	fprintf(stderr, "         listhet   extract the position of each het\n");
	fprintf(stderr, "\n");
	return 1;
}

int main(int argc, char *argv[])
{
	if (argc == 1) return usage();
	if (strcmp(argv[1], "comp") == 0) return stk_comp(argc-1, argv+1);
	else if (strcmp(argv[1], "fqchk") == 0) return stk_fqchk(argc-1, argv+1);
	// else if (strcmp(argv[1], "hety") == 0) return stk_hety(argc-1, argv+1);
	// else if (strcmp(argv[1], "gc") == 0) return stk_gc(argc-1, argv+1);
	// else if (strcmp(argv[1], "subseq") == 0) return stk_subseq(argc-1, argv+1);
	// else if (strcmp(argv[1], "mutfa") == 0) return stk_mutfa(argc-1, argv+1);
	// else if (strcmp(argv[1], "mergefa") == 0) return stk_mergefa(argc-1, argv+1);
	// else if (strcmp(argv[1], "mergepe") == 0) return stk_mergepe(argc-1, argv+1);
	// else if (strcmp(argv[1], "dropse") == 0) return stk_dropse(argc-1, argv+1);
	// else if (strcmp(argv[1], "randbase") == 0) return stk_randbase(argc-1, argv+1);
	// else if (strcmp(argv[1], "cutN") == 0) return stk_cutN(argc-1, argv+1);
	// else if (strcmp(argv[1], "listhet") == 0) return stk_listhet(argc-1, argv+1);
	// else if (strcmp(argv[1], "famask") == 0) return stk_famask(argc-1, argv+1);
	// else if (strcmp(argv[1], "trimfq") == 0) return stk_trimfq(argc-1, argv+1);
	// else if (strcmp(argv[1], "hrun") == 0) return stk_hrun(argc-1, argv+1);
	// else if (strcmp(argv[1], "sample") == 0) return stk_sample(argc-1, argv+1);
	// else if (strcmp(argv[1], "seq") == 0) return stk_seq(argc-1, argv+1);
	// else if (strcmp(argv[1], "kfreq") == 0) return stk_kfreq(argc-1, argv+1);
	// else if (strcmp(argv[1], "rename") == 0) return stk_rename(argc-1, argv+1);
	else {
		fprintf(stderr, "[main] unrecognized command '%s'. Abort!\n", argv[1]);
		return 1;
	}
}
