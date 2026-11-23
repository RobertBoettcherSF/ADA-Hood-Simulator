with Hood.Population.Setup;

package body Hood.Population.Week is

   use type Hood.Units.Units;

   Cell : constant := 54 * Hood.Units.Scale;  --  one block cell, in units
   Slices : constant := 6;                    --  sim.ts:55 AMBIENT_SLICES

   --  The people in 1.2.91's walking order: slice by slice (id mod 6), each
   --  slice in id order. Rebuilt when somebody joins the city.
   Order       : array (Integer_32 range 0 .. Max_People - 1) of Integer_32;
   Order_Count : Integer_32 := -1;
   Order_Last  : Integer_32 := -1;

   procedure Build_Order (S : Population_State) is
      N : Integer_32 := 0;
   begin
      for Slice in Integer_32 range 0 .. Slices - 1 loop
         for I in Integer_32 range 0 .. S.Count - 1 loop
            if S.People (I).Id mod Slices = Slice then
               Order (N) := I;
               N := N + 1;
            end if;
         end loop;
      end loop;
      Order_Count := S.Count;
      Order_Last := (if S.Count > 0 then S.People (S.Count - 1).Id else -1);
   end Build_Order;

   ---------------------------------------------------------------------
   --  Draws, counted for the +/-20 % check
   ---------------------------------------------------------------------

   procedure Chance
     (S : in out Population_State; Main : in out Hood.Random.Mulberry;
      Num, Den : Unsigned_32; Result : out Boolean) is
   begin
      Hood.Random.Chance (Main, Num, Den, Result);
      S.Draws_This_Week := S.Draws_This_Week + 1;
   end Chance;

   procedure Int
     (S : in out Population_State; Main : in out Hood.Random.Mulberry;
      Min, Max : Integer_32; Value : out Integer_32) is
   begin
      Hood.Random.Int (Main, Min, Max, Value);
      S.Draws_This_Week := S.Draws_This_Week + 1;
   end Int;

   ---------------------------------------------------------------------
   --  Walking
   ---------------------------------------------------------------------

   --  How strongly a block draws errands (ambient.ts tradingOn): the plan's
   --  land value in the Standard city, else its trading businesses.
   function Draw_Of
     (S : Population_State; C : Hood.City.City_State; B : Integer_32)
      return Integer_32 is
     (if C.Standard then C.Blocks (B).Plan_Value else S.Trading (B));

   --  ambient.ts wanderTo: up to four tries for a block with a pavement
   --  within Radius blocks; of the first two found the busier one; then a
   --  spot on its pavement.
   procedure Wander
     (S : in out Population_State; C : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry; I : Integer_32; Radius : Integer_32)
   is
      P  : Person_Rec renames S.People (I);
      GX : constant Integer_32 := Integer_32 (P.X / Cell);
      GY : constant Integer_32 := Integer_32 (P.Y / Cell);
      Found : Integer_32 := 0;
      Best  : Integer_32 := No_Id;
      NX, NY, Cand, Spot : Integer_32;
      Attempt : Integer_32 := 0;
   begin
      while Attempt < 4 and then Found < 2 loop
         Int (S, Main, -Radius, Radius, NX);
         NX := Integer_32'Max (0, Integer_32'Min (C.W - 1, GX + NX));
         Int (S, Main, -Radius, Radius, NY);
         NY := Integer_32'Max (0, Integer_32'Min (C.H - 1, GY + NY));
         Cand := Block_At (C, NX, NY);
         if Cand /= No_Id and then Has_Footway (C, Cand) then
            Found := Found + 1;
            if Best = No_Id or else Draw_Of (S, C, Cand) > Draw_Of (S, C, Best) then
               Best := Cand;
            end if;
         end if;
         Attempt := Attempt + 1;
      end loop;
      if Best = No_Id then
         return;
      end if;
      Int (S, Main, 0, 100_000, Spot);
      Pavement (C.Blocks (Best), Spot, P.DX, P.DY);
      P.Walking := True;
   end Wander;

   --  One minute's walk: along x, then along y (proposed; 1.2.91 follows
   --  pavement routes, item 6). True on arrival.
   function Step (P : in out Person_Rec) return Boolean is
      Left : Hood.Units.Units := Walk_Step;
      D    : Hood.Units.Units;
   begin
      D := P.DX - P.X;
      if D /= 0 then
         if abs D <= Left then
            P.X := P.DX;
            Left := Left - abs D;
         else
            P.X := P.X + (if D > 0 then Left else -Left);
            Left := 0;
         end if;
      end if;
      D := P.DY - P.Y;
      if D /= 0 and then Left > 0 then
         if abs D <= Left then
            P.Y := P.DY;
         else
            P.Y := P.Y + (if D > 0 then Left else -Left);
         end if;
      end if;
      if P.X = P.DX and then P.Y = P.DY then
         P.Walking := False;
         return True;
      end if;
      return False;
   end Step;

   procedure Go_Inside
     (S : in out Population_State; C : Hood.City.City_State;
      I : Integer_32; B : Integer_32)
   is
      L : constant Integer_32 := C.Buildings (B).Lot;
   begin
      S.People (I).Building := B;
      S.People (I).X := C.Lots (L).Center_X;
      S.People (I).Y := C.Lots (L).Center_Y;
      S.People (I).Walking := False;
   end Go_Inside;

   --  ambient.ts ambientPerson, for the people of item 4 (nobody is on an
   --  order, in a car, a tram, a meeting or an FBI case yet).
   procedure Ambient
     (S : in out Population_State; C : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry; I : Integer_32)
   is
      Kind : constant Role := S.People (I).Kind;
      Go   : Boolean;
      Arrived : Boolean;
   begin
      if S.People (I).Status /= Active then
         return;
      end if;
      --  An idle hood or lieutenant waits inside his gang's office. 1.2.91
      --  first checks he stands within 24 m of its door; at the start every
      --  one stands on the office lot (unproven for later items).
      if S.People (I).Gang /= 0 and then not S.People (I).Walking
        and then Kind in R_Hood | R_Lieutenant
        and then S.People (I).Building = No_Id
        and then S.Gangs (S.People (I).Gang).Office /= No_Id
      then
         Go_Inside (S, C, I, S.Gangs (S.People (I).Gang).Office);
         return;
      end if;
      if S.People (I).Building /= No_Id
        and then Kind not in R_Police | R_Fbi | R_Snitch | R_Reporter
      then
         return;  --  owners and managers stay at their premises
      end if;
      case Kind is
         when R_Citizen | R_Snitch =>
            if S.People (I).Walking then
               Arrived := Step (S.People (I));
            else
               Chance (S, Main, 1, 1, Go);  --  min (1, 3 x 1 minute)
               if Go then
                  Wander (S, C, Main, I, 5);
               end if;
            end if;
         when R_Reporter =>
            if S.People (I).Building /= No_Id then
               if S.Extra (S.People (I).Building).Owner_Person = I then
                  return;  --  the editor stays at the newspaper
               end if;
               S.People (I).Building := No_Id;
            end if;
            if S.People (I).Walking then
               Arrived := Step (S.People (I));
            else
               Chance (S, Main, 2, 25, Go);  --  0.08
               if Go then
                  Wander (S, C, Main, I, 2);
               end if;
            end if;
         when R_Judge | R_Da | R_Mayor | R_Police_Chief | R_Fbi_Head =>
            if S.People (I).Walking then
               Arrived := Step (S.People (I));
            else
               Chance (S, Main, 3, 100, Go);  --  0.03
               if Go then
                  Wander (S, C, Main, I, 1);
               end if;
            end if;
         when R_Police =>
            if S.People (I).Walking then
               Arrived := Step (S.People (I));
            else
               Chance (S, Main, 1, 1, Go);  --  min (1, 1 x 1 minute)
               if Go then
                  Wander (S, C, Main, I, 2);
               end if;
            end if;
         when R_Fbi =>
            if S.People (I).Walking then
               Arrived := Step (S.People (I));
            else
               Chance (S, Main, 1, 25, Go);  --  0.04
               if Go then
                  Wander (S, C, Main, I, 4);
               end if;
            end if;
         when R_Hood | R_Lieutenant | R_Boss | R_Accountant | R_Lawyer =>
            if S.People (I).Walking then
               Arrived := Step (S.People (I));
               if Arrived and then Kind in R_Hood | R_Lieutenant
                 and then S.People (I).Gang /= 0
                 and then S.Gangs (S.People (I).Gang).Office /= No_Id
               then
                  Go_Inside (S, C, I, S.Gangs (S.People (I).Gang).Office);
               end if;
            end if;
         when others =>
            if S.People (I).Walking then
               Arrived := Step (S.People (I));
            end if;
      end case;
   end Ambient;

   ---------------------------------------------------------------------
   --  The week
   ---------------------------------------------------------------------

   procedure Launch (S : in out Population_State) is
   begin
      S.Phase := Week_Running;
      S.Minute := 0;
      S.Draws_This_Week := 0;
   end Launch;

   procedure Tick
     (S    : in out Population_State;
      C    : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry) is
   begin
      if Order_Count /= S.Count
        or else Order_Last /= (if S.Count > 0 then S.People (S.Count - 1).Id else -1)
      then
         Build_Order (S);
      end if;
      S.Minute := S.Minute + 1;
      for K in Integer_32 range 0 .. S.Count - 1 loop
         Ambient (S, C, Main, Order (K));
      end loop;
      if S.Week = 1 and then S.Minute = 1 then
         S.Rng_After_Minute_1 := Hood.Random.State (Main);
      end if;
   end Tick;

   ---------------------------------------------------------------------
   --  Members
   ---------------------------------------------------------------------

   procedure Remove (List : in out Member_List; Count : in out Integer_32;
                     Person : Integer_32) is
      N : Integer_32 := 0;
   begin
      for K in 1 .. Integer (Count) loop
         if List (K) /= Person then
            N := N + 1;
            List (Integer (N)) := List (K);
         end if;
      end loop;
      Count := N;
   end Remove;

   --  The gang's men who draw wages, in 1.2.91's gangMembers order: the
   --  boss, the lieutenant and his crew, the pool, then the managers.
   type Member_Set is array (1 .. 2 * Max_Pool + 3) of Integer_32;

   procedure Members (S : Population_State; G : Gang_Id;
                      List : out Member_Set; Count : out Integer) is
      Gang : Gang_Rec renames S.Gangs (G);
      procedure Add (P : Integer_32) is
      begin
         if P /= No_Id then
            Count := Count + 1;
            List (Count) := P;
         end if;
      end Add;
   begin
      List := [others => No_Id];
      Count := 0;
      Add (Gang.Lieutenant);
      for K in 1 .. Integer (Gang.Crew_Count) loop
         Add (Gang.Crew (K));
      end loop;
      for K in 1 .. Integer (Gang.Pool_Count) loop
         Add (Gang.Pool (K));
      end loop;
      Add (Gang.Manager);
   end Members;

   --  A crew broken up: its men and its kit go back to the gang.
   procedure Disband (S : in out Population_State; G : Gang_Id) is
      Gang : Gang_Rec renames S.Gangs (G);
   begin
      for K in 1 .. Integer (Gang.Crew_Count) loop
         if Gang.Pool_Count < Max_Pool then
            Gang.Pool_Count := Gang.Pool_Count + 1;
            Gang.Pool (Integer (Gang.Pool_Count)) := Gang.Crew (K);
         end if;
         S.People (Gang.Crew (K)).Team := No_Id;
      end loop;
      Gang.Crew_Count := 0;
      Gang.Pistols := Gang.Pistols + Gang.Crew_Pistols;
      Gang.Coupes := Gang.Coupes + Gang.Crew_Coupes;
      Gang.Crew_Pistols := 0;
      Gang.Crew_Coupes := 0;
      Gang.Lieutenant := No_Id;
   end Disband;

   procedure Defect (S : in out Population_State; Person : Integer_32) is
      P : Person_Rec renames S.People (Person);
      G : constant Gang_Ref := P.Gang;
   begin
      if G = 0 then
         return;
      end if;
      P.Gang := 0;
      P.Loyalty := 50 * Loyalty_Per_Percent;
      P.Hostility := -1;
      P.Fear := -1;
      P.Opinion (G) := Integer_8 (Integer_32'Min (-30, Integer_32 (P.Opinion (G)) - 30));
      if P.Kind = R_Lieutenant then
         P.Kind := R_Hood;
      end if;
      P.Team := No_Id;
      Remove (S.Gangs (G).Crew, S.Gangs (G).Crew_Count, Person);
      Remove (S.Gangs (G).Pool, S.Gangs (G).Pool_Count, Person);
      if P.Building /= No_Id then
         if S.Extra (P.Building).Manager = Person then
            S.Extra (P.Building).Manager := No_Id;
         end if;
         P.Building := No_Id;
      end if;
      if S.Gangs (G).Manager = Person then
         S.Gangs (G).Manager := No_Id;
      end if;
      if S.Gangs (G).Lieutenant = Person then
         Disband (S, G);
      end if;
   end Defect;

   procedure Shift_Hostility (P : in out Person_Rec; G : Gang_Id; By : Integer_32) is
   begin
      P.Hostility := Integer_16 (Integer_32'Max (0, Integer_32'Min (255, Hostility_Of (P, G) + By)));
   end Shift_Hostility;

   ---------------------------------------------------------------------
   --  Week's end
   ---------------------------------------------------------------------

   Desertion_Loyalty : constant := 16 * Loyalty_Byte;   --  0x460300 step 8
   Half_Pay_Loyalty  : constant := 16 * Loyalty_Byte;
   No_Pay_Loyalty    : constant := 48 * Loyalty_Byte;

   --  economy.ts weeklyEconomy, its costs half: wages owed, paid in full,
   --  half or not at all as the safe allows, then each man's loyalty.
   procedure Pay_Wages (S : in out Population_State) is
      List  : Member_Set;
      Count : Integer;
      Owed, Paid : Integer_32;
      Half, None : Boolean;
   begin
      for G in Gang_Id loop
         if not S.Gangs (G).Eliminated then
            Members (S, G, List, Count);
            Owed := 0;
            for K in 1 .. Count loop
               Owed := Owed + S.People (List (K)).Pay;
            end loop;
            None := False;
            Half := False;
            if S.Gangs (G).Cash < Owed then
               if 2 * Integer_64 (S.Gangs (G).Cash) >= Integer_64 (Owed) then
                  Half := True;
               else
                  None := True;
               end if;
            end if;
            Paid := (if None then 0 elsif Half then (Owed + 1) / 2 else Owed);
            S.Gangs (G).Cash := S.Gangs (G).Cash - Paid;
            S.Gangs (G).Wages := Paid;
            for K in 1 .. Count loop
               declare
                  P : Person_Rec renames S.People (List (K));
                  Quote, Demand, Short, Ratio_100, Cut : Integer_32;
               begin
                  if Half or None then
                     Shift_Hostility (P, G, (if None then 32 else 8));
                     P.Loyalty := P.Loyalty - (if None then No_Pay_Loyalty else Half_Pay_Loyalty);
                  end if;
                  --  1.2.91 weekly wage: requote, ratchet,
                  --  judge the wage against the demand.
                  Quote := Wage_Quote (P, G);
                  Demand := Integer_32'Max (P.Demand, P.Pay);
                  if Demand + 20 < Quote then
                     Demand := Quote;
                  end if;
                  P.Demand := Demand;
                  Short := Demand - P.Pay;
                  if Short <= 0 then
                     P.Loyalty := Integer_32'Min (Loyalty_Full, P.Loyalty + 4 * Loyalty_Byte);
                  elsif Short > 20 then
                     --  100 x pay / demand compared with 76, 51, 26 and 1:
                     --  exact in whole numbers as 100 x pay against k x demand.
                     Ratio_100 := 100 * P.Pay;
                     Cut := (if Ratio_100 > 76 * Demand then 4
                             elsif Ratio_100 > 51 * Demand then 8
                             elsif Ratio_100 > 26 * Demand then 16
                             elsif Ratio_100 > Integer_32'Max (1, Demand) then 32
                             else 64);
                     P.Loyalty := Integer_32'Max (0, P.Loyalty - Cut * Loyalty_Byte);
                     Shift_Hostility (P, G, 4);
                  end if;
                  P.Loyalty := Integer_32'Max (0, Integer_32'Min (Loyalty_Full, P.Loyalty));
               end;
            end loop;
            --  Desertions.
            Members (S, G, List, Count);
            for K in 1 .. Count loop
               if S.People (List (K)).Loyalty <= Desertion_Loyalty then
                  Defect (S, List (K));
               end if;
            end loop;
         end if;
      end loop;
   end Pay_Wages;

   --  sim.ts checkSuccession: a rival gang whose boss is gone is taken over
   --  by its best organiser (lieutenant, crew, pool, then managers), or is
   --  finished. Nobody dies before item 7, so this runs untested until then
   --  (unproven); his old crew goes back to the pool (1.2.91 promotes its
   --  first man; item 7).
   procedure Check_Succession (S : in out Population_State) is
      List  : Member_Set;
      Count : Integer;
      Heir  : Integer_32;
      function Score (P : Integer_32) return Integer is
        (Integer (S.People (P).Skills (Organization)) + Integer (S.People (P).Skills (Intelligence)));
   begin
      for G in Gang_Id loop
         if not S.Gangs (G).Eliminated and then not S.Gangs (G).Player
           and then S.People (S.Gangs (G).Boss).Status = Dead
         then
            Members (S, G, List, Count);
            Heir := No_Id;
            for K in 1 .. Count loop
               if S.People (List (K)).Status = Active
                 and then (Heir = No_Id or else Score (List (K)) > Score (Heir))
               then
                  Heir := List (K);
               end if;
            end loop;
            if Heir = No_Id then
               S.Gangs (G).Eliminated := True;
            else
               if S.Gangs (G).Lieutenant = Heir then
                  Disband (S, G);
               end if;
               Remove (S.Gangs (G).Crew, S.Gangs (G).Crew_Count, Heir);
               Remove (S.Gangs (G).Pool, S.Gangs (G).Pool_Count, Heir);
               if S.Gangs (G).Manager = Heir then
                  S.Gangs (G).Manager := No_Id;
               end if;
               if S.People (Heir).Building /= No_Id then
                  if S.Extra (S.People (Heir).Building).Manager = Heir then
                     S.Extra (S.People (Heir).Building).Manager := No_Id;
                  end if;
                  S.People (Heir).Building := No_Id;
               end if;
               S.People (Heir).Kind := R_Boss;
               S.People (Heir).Team := No_Id;
               S.Gangs (G).Boss := Heir;
            end if;
         end if;
      end loop;
   end Check_Succession;

   procedure Settle
     (S    : in out Population_State;
      C    : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry) is
   begin
      for Stage in Settlement_Stage loop
         case Stage is
            when Economy =>
               Pay_Wages (S);
            when Succession =>
               Check_Succession (S);
            when End_Conditions =>
               for G in Gang_Id loop
                  if S.Gangs (G).Player
                    and then S.People (S.Gangs (G).Boss).Status = Dead
                  then
                     S.Game_Over := True;
                  end if;
               end loop;
            when Next_Week =>
               S.Week := S.Week + 1;
               Hood.Population.Setup.Top_Up (S, C, Main);
               S.Minute := 0;
            when others =>
               null;  --  kept for the item that brings it
         end case;
      end loop;
      S.Phase := Planning;
   end Settle;

   procedure Finish
     (S    : in out Population_State;
      C    : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry) is
   begin
      while S.Minute < Minutes_Per_Week loop
         Tick (S, C, Main);
      end loop;
      Settle (S, C, Main);
   end Finish;

end Hood.Population.Week;
